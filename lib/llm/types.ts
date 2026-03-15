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
  /**
   * Optional Google (Gemini) API key. When set, used instead of process.env.GEMINI_API_KEY.
   * Used by RAG/chat when the org has a stored provider secret.
   */
  googleApiKey?: string;
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
  /**
   * Stream chat completion tokens. Yields text chunks as they arrive.
   * Caller can collect chunks to form the full assistant message.
   */
  chatStream(request: LlmChatRequest): AsyncGenerator<string, void, unknown>;
}

