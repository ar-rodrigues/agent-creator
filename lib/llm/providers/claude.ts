import { ILlmClient, LlmChatRequest, LlmChatResponse, LlmMessage } from "@/lib/llm/types";

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-3-5-sonnet-latest";

type ClaudeMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ClaudeResponse = {
  id: string;
  model: string;
  content: { type: "text"; text: string }[];
};

export class ClaudeLlmClient implements ILlmClient {
  async chat(request: LlmChatRequest): Promise<LlmChatResponse> {
    if (!CLAUDE_API_KEY) {
      throw new Error("CLAUDE_API_KEY is not configured");
    }

    const url = "https://api.anthropic.com/v1/messages";

    const systemMessages = request.messages.filter((m) => m.role === "system");
    const nonSystemMessages = request.messages.filter((m) => m.role !== "system");

    const systemPrompt = systemMessages.map((m) => m.content).join("\n\n");

    const messages: ClaudeMessage[] = nonSystemMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const body = {
      model: request.model ?? CLAUDE_MODEL,
      max_tokens: request.maxTokens ?? 512,
      temperature: request.temperature ?? 0.2,
      system: systemPrompt || undefined,
      messages,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "Claude chat request failed");
    }

    const raw = (await res.json()) as ClaudeResponse;
    const text = raw.content?.map((c) => c.text).join("") ?? "";

    const assistantMessage: LlmMessage = {
      role: "assistant",
      content: text,
    };

    return {
      messages: [...request.messages, assistantMessage],
      raw,
      provider: "claude",
      model: raw.model ?? (body.model as string),
    };
  }
}

