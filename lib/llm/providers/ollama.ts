import { ILlmClient, LlmChatRequest, LlmChatResponse, LlmMessage } from "@/lib/llm/types";

const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "phi4-mini";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

type OllamaChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OllamaChatResponse = {
  message: OllamaChatMessage;
  model: string;
};

export class OllamaLlmClient implements ILlmClient {
  async chat(request: LlmChatRequest): Promise<LlmChatResponse> {
    const body = {
      model: request.model ?? DEFAULT_OLLAMA_MODEL,
      messages: request.messages.map(mapToOllamaMessage),
      stream: false,
      options: {
        temperature: request.temperature ?? 0.2,
        num_predict: request.maxTokens ?? 512,
      },
    };

    const res = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "Ollama chat request failed");
    }

    const raw = (await res.json()) as {
      choices?: { message?: OllamaChatMessage }[];
      model?: string;
    };

    const first = raw.choices?.[0]?.message;
    if (!first) {
      throw new Error("Ollama returned no choices");
    }

    const assistantMessage: LlmMessage = {
      role: "assistant",
      content: first.content,
    };

    return {
      messages: [...request.messages, assistantMessage],
      raw,
      provider: "local",
      model: raw.model ?? (body.model as string),
    };
  }
}

function mapToOllamaMessage(message: LlmMessage): OllamaChatMessage {
  return {
    role: message.role,
    content: message.content,
  };
}

