import { ILlmClient, LlmChatRequest, LlmChatResponse, LlmMessage } from "@/lib/llm/types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-pro";

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
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const model = request.model ?? GEMINI_MODEL;
    const url = new URL(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent`,
    );
    url.searchParams.set("key", GEMINI_API_KEY);
    url.searchParams.set("alt", "sse");

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "Gemini stream request failed");
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
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const url = new URL(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model ?? GEMINI_MODEL)}:generateContent`,
    );
    url.searchParams.set("key", GEMINI_API_KEY);

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
      throw new Error(text || "Gemini chat request failed");
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

