/** Default context window size (tokens) for RAG/chat. */
export const CONTEXT_WINDOW_MAX_TOKENS = 128_000;

/**
 * Conservative token estimate for typical prose (~4 chars per token).
 * Used for context-window truncation and UI indicators; not a precise tokenizer.
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}
