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

