import { ILlmClient, LlmChatRequest, LlmChatResponse, LlmMessage } from "@/lib/llm/types";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

function getApiKey(request: LlmChatRequest): string | undefined {
  return request.googleApiKey?.trim();
}

/** Strip display suffix like " (gemini)" so the API receives a valid model id. */
function normalizeModelId(model: string | undefined): string {
  const raw = model ?? GEMINI_MODEL;
  const withoutSuffix = raw.includes(" (") ? raw.split(" (")[0].trim() : raw;
  return withoutSuffix || GEMINI_MODEL;
}

type GeminiContent = {
  role: "user" | "model";
  parts: { text: string }[];
};

type GeminiGenerateContentResponse = {
  candidates?: {
    content?: GeminiContent;
  }[];
  modelVersion?: string;
};

export class GeminiLlmClient implements ILlmClient {
  async *chatStream(request: LlmChatRequest): AsyncGenerator<string, void, unknown> {
    const apiKey = getApiKey(request);
    if (!apiKey) {
      throw new Error(
        "Google (Gemini) API key is not configured. Set it in Org settings (Cloud provider API keys) or via GEMINI_API_KEY.",
      );
    }

    const model = normalizeModelId(request.model);
    const url = new URL(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent`,
    );
    url.searchParams.set("key", apiKey);
    url.searchParams.set("alt", "sse");

    const contents: GeminiContent[] = request.messages.map(mapToGeminiContent);
    const maxOutputTokens = request.maxTokens ?? 512;
    const body = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        maxOutputTokens,
      },
    };

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const message = parseGeminiErrorResponse(text);
      throw new Error(message || "Gemini stream request failed");
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Gemini stream has no body");

    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]" || jsonStr === "") continue;
            try {
              const data = JSON.parse(jsonStr) as {
                candidates?: { content?: { parts?: { text?: string }[] } }[];
              };
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) yield text;
            } catch {
              // skip malformed
            }
          }
        }
      }
      if (buffer.startsWith("data: ")) {
        const jsonStr = buffer.slice(6).trim();
        if (jsonStr && jsonStr !== "[DONE]") {
          try {
            const data = JSON.parse(jsonStr) as {
              candidates?: { content?: { parts?: { text?: string }[] } }[];
            };
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) yield text;
          } catch {
            // skip
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async chat(request: LlmChatRequest): Promise<LlmChatResponse> {
    const apiKey = getApiKey(request);
    if (!apiKey) {
      throw new Error(
        "Google (Gemini) API key is not configured. Set it in Org settings under Cloud provider API keys.",
      );
    }

    const model = normalizeModelId(request.model);
    const url = new URL(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    );
    url.searchParams.set("key", apiKey);

    const contents: GeminiContent[] = request.messages.map(mapToGeminiContent);

    const body = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        maxOutputTokens: request.maxTokens ?? 512,
      },
    };

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const message = parseGeminiErrorResponse(text);
      throw new Error(message || "Gemini chat request failed");
    }

    const raw = (await res.json()) as GeminiGenerateContentResponse;
    const candidate = raw.candidates?.[0]?.content;
    const text = candidate?.parts?.map((p) => p.text).join("") ?? "";

    const assistantMessage: LlmMessage = {
      role: "assistant",
      content: text,
    };

    return {
      messages: [...request.messages, assistantMessage],
      raw,
      provider: "gemini",
      model: request.model ?? GEMINI_MODEL,
    };
  }
}

function mapToGeminiContent(message: LlmMessage): GeminiContent {
  const role = message.role === "assistant" ? "model" : "user";
  return {
    role,
    parts: [{ text: message.content }],
  };
}

/** Extract a short user-facing message from Gemini API error JSON. */
function parseGeminiErrorResponse(body: string): string | null {
  try {
    const json = JSON.parse(body) as { error?: { message?: string } };
    const msg = json?.error?.message?.trim();
    if (msg) {
      return msg.split("\n")[0].trim();
    }
  } catch {
    // not JSON or unexpected shape
  }
  return null;
}

