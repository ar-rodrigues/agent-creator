type EmbedChunksArgs = {
  orgId: string;
  documentId: string;
  /**
   * Target embedding version for this embedding run.
   * When omitted, the Edge Function should default to the org's current embedding version.
   */
  embeddingVersion?: number;
};

// Embedding is no longer handled via a Supabase Edge Function.
// This helper is kept as a placeholder so callers don't crash, but it does
// not invoke any remote function. A future implementation can call OpenAI
// or local embedding models directly from the backend.
export async function embedChunksForDocument(_args: EmbedChunksArgs): Promise<void> {
  console.warn(
    "embedChunksForDocument is currently a no-op; embeddings must be handled by a direct backend implementation.",
  );
}

