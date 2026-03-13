export type LlmRole = "system" | "user" | "assistant";

export type LlmMessage = {
  role: LlmRole;
  content: string;
};

export type LlmProvider = "local" | "ollama" | "gemini" | "claude";

export type LlmChatRequest = {
  messages: LlmMessage[];
  /**
   * Optional per-call model override. If omitted, the provider-specific
   * default model is used (configured via environment variables).
   */
  model?: string;
  /**
   * Maximum number of tokens to generate, if supported by the provider.
   */
  maxTokens?: number;
  /**
   * Temperature / sampling controls. Interpreted per provider.
   */
  temperature?: number;
};

export type LlmChatResponse = {
  messages: LlmMessage[];
  /**
   * Raw provider response for debugging / observability.
   * Shape is provider-specific and should not be relied on by callers.
   */
  raw?: unknown;
  provider: LlmProvider;
  model: string;
};

export interface ILlmClient {
  chat(request: LlmChatRequest): Promise<LlmChatResponse>;
}

