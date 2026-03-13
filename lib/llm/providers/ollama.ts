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
  async *chatStream(request: LlmChatRequest): AsyncGenerator<string, void, unknown> {
    const body = {
      model: request.model ?? DEFAULT_OLLAMA_MODEL,
      messages: request.messages.map(mapToOllamaMessage),
      stream: true,
      options: {
        temperature: request.temperature ?? 0.2,
        num_predict: request.maxTokens ?? 512,
      },
    };

    const res = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "Ollama chat stream request failed");
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Ollama stream has no body");

    const decoder = new TextDecoder();
    let buffer = "";
    const parseStreamLine = (line: string): string | null => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") return null;
      let jsonStr = trimmed;
      if (jsonStr.startsWith("data:")) jsonStr = jsonStr.slice(5).trim();
      try {
        const parsed = JSON.parse(jsonStr) as {
          message?: { content?: string };
          choices?: { delta?: { content?: string } }[];
        };
        return (
          parsed.choices?.[0]?.delta?.content ?? parsed.message?.content ?? null
        );
      } catch {
        return null;
      }
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const content = parseStreamLine(line);
          if (content) yield content;
        }
      }
      const content = parseStreamLine(buffer);
      if (content) yield content;
    } finally {
      reader.releaseLock();
    }
  }

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

