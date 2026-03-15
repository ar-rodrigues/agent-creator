import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgModelConfig } from "@/lib/llm/orgConfig";
import { getGoogleApiKey } from "@/lib/llm/getGoogleApiKey";

type EmbedChunksArgs = {
  orgId: string;
  documentId: string;
  /**
   * Target embedding version for this embedding run.
   * When omitted, uses the org's current embedding version.
   */
  embeddingVersion?: number;
};

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

type EmbeddingModelMeta = {
  dimension: number | null;
  /** Max tokens per input. Used to truncate chunks before sending to Ollama. */
  contextLength: number | null;
};

/**
 * Fetches dimension and context_length for a provider+model from the registry.
 */
async function getEmbeddingModelMeta(
  provider: string,
  modelName: string,
): Promise<EmbeddingModelMeta> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("embedding_models")
    .select("dimension, context_length")
    .eq("provider", provider)
    .eq("name", modelName)
    .eq("kind", "embedding")
    .maybeSingle();

  return {
    dimension: (data?.dimension as number | null) ?? null,
    contextLength: (data?.context_length as number | null) ?? null,
  };
}

/**
 * Truncates text so it stays within the model's context_length.
 * Uses a conservative 1 char-per-token estimate (worst-case for dense content
 * like indexes, tables, and page numbers which tokenize at ~1-2 chars/token).
 * The 4 chars/token estimate is only valid for normal prose.
 */
function truncateToContextLength(text: string, contextLength: number): string {
  const maxChars = contextLength;
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

/**
 * Calls Ollama /api/embed with a batch of inputs in a single HTTP request.
 * Ollama applies its context window per-input, not across the whole batch,
 * so sending N inputs costs one round-trip rather than N.
 * Falls back to one-by-one processing with progressive truncation if the
 * batch call fails (e.g. a single item still exceeds the context window
 * after pre-truncation).
 */
async function embedWithOllama(
  model: string,
  inputs: string[],
): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const res = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: inputs }),
  });

  if (res.ok) {
    const json = (await res.json()) as { embeddings?: number[][] };
    const embeddings = json.embeddings;
    if (Array.isArray(embeddings) && embeddings.length === inputs.length) {
      return embeddings;
    }
  }

  // Fallback: process each input individually with truncation retries
  const errorText = await res.text().catch(() => "");
  console.warn(`embedWithOllama: batch failed (${res.status}), falling back to per-item. ${errorText}`);

  const results: number[][] = [];
  for (const input of inputs) {
    results.push(await embedOneWithOllama(model, input));
  }
  return results;
}

/**
 * Single-item embed with progressive truncation on context-length errors.
 * Only called as fallback when the batch request fails.
 */
async function embedOneWithOllama(model: string, input: string): Promise<number[]> {
  let text = input;
  const MAX_ATTEMPTS = 4;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text }),
    });

    if (res.ok) {
      const json = (await res.json()) as { embeddings?: number[][] };
      const embeddings = json.embeddings;
      if (!Array.isArray(embeddings) || embeddings.length !== 1) {
        throw new Error(
          `Ollama returned ${embeddings?.length ?? 0} embeddings, expected 1`,
        );
      }
      if (attempt > 0) {
        console.warn(
          `embedOneWithOllama: succeeded after ${attempt} truncation(s), final length ${text.length} chars`,
        );
      }
      return embeddings[0];
    }

    const errorText = await res.text().catch(() => "");
    if (errorText.includes("context length") && text.length > 100) {
      text = text.slice(0, Math.floor(text.length * 0.75));
      continue;
    }

    throw new Error(errorText || `Ollama embed failed: ${res.status}`);
  }

  throw new Error(
    `Ollama embed failed: input too long after ${MAX_ATTEMPTS} truncation attempts (original ${input.length} chars)`,
  );
}

const GEMINI_EMBED_BASE = "https://generativelanguage.googleapis.com/v1beta";

type GeminiEmbedContentResponse = {
  embedding?: { values?: number[] };
};

type GeminiBatchEmbedResponse = {
  embeddings?: { values?: number[] }[];
};

/**
 * Calls Google Generative Language API embedContent (single or batch) for the given model.
 * Model name should be as in the registry (e.g. text-embedding-004, text-embedding-005).
 */
async function embedWithGoogle(
  apiKey: string,
  model: string,
  inputs: string[],
): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const modelPath = model.startsWith("models/") ? model : `models/${model}`;

  if (inputs.length === 1) {
    const url = new URL(`${GEMINI_EMBED_BASE}/${modelPath}:embedContent`);
    url.searchParams.set("key", apiKey);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text: inputs[0] }] },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Google embed failed: ${res.status}`);
    }
    const data = (await res.json()) as GeminiEmbedContentResponse;
    const values = data.embedding?.values;
    if (!Array.isArray(values)) {
      throw new Error("Google embed response missing embedding.values");
    }
    return [values];
  }

  const url = new URL(`${GEMINI_EMBED_BASE}/${modelPath}:batchEmbedContents`);
  url.searchParams.set("key", apiKey);
  const body = {
    requests: inputs.map((text) => ({
      model: modelPath,
      content: { parts: [{ text }] },
    })),
  };
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Google batch embed failed: ${res.status}`);
  }
  const data = (await res.json()) as GeminiBatchEmbedResponse;
  const embeddings = data.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== inputs.length) {
    throw new Error(
      `Google batch embed returned ${embeddings?.length ?? 0} embeddings, expected ${inputs.length}`,
    );
  }
  return embeddings.map((e) => e.values ?? []);
}

/**
 * Embeds all chunks for a document using the org's configured embedding model,
 * then updates document_chunks with the vectors and version metadata.
 */
export async function embedChunksForDocument(
  args: EmbedChunksArgs,
): Promise<void> {
  const { orgId, documentId, embeddingVersion: requestedVersion } = args;

  const supabase = await createSupabaseServerClient();
  const orgConfig = await getOrgModelConfig(orgId);

  if (!orgConfig.embeddingModel?.trim()) {
    console.warn(
      "embedChunksForDocument: no embedding model configured for org, skipping",
    );
    return;
  }

  const isOllama = orgConfig.embeddingProvider === "ollama";
  const isGemini = orgConfig.embeddingProvider === "gemini";
  if (!isOllama && !isGemini) {
    console.warn(
      "embedChunksForDocument: unsupported embedding provider, skipping",
    );
    return;
  }

  if (isGemini) {
    const apiKey = await getGoogleApiKey(orgId);
    if (!apiKey) {
      console.warn(
        "embedChunksForDocument: Gemini embedding selected but no Google API key (org secret or GEMINI_API_KEY)",
      );
      return;
    }
  }

  const version =
    requestedVersion ?? orgConfig.currentEmbeddingVersion ?? 1;

  const { data: chunks, error: fetchError } = await supabase
    .from("document_chunks")
    .select("id, content, chunk_index")
    .eq("org_id", orgId)
    .eq("document_id", documentId)
    .order("chunk_index", { ascending: true });

  if (fetchError) {
    console.warn("embedChunksForDocument: failed to fetch chunks", fetchError.message);
    return;
  }

  if (!chunks?.length) {
    return;
  }

  const { dimension, contextLength } = await getEmbeddingModelMeta(
    orgConfig.embeddingProvider,
    orgConfig.embeddingModel,
  );

  // Use registry context length; fall back to 150 tokens as a conservative
  // default for the smallest observed working size with local Ollama models.
  const effectiveContextLength = contextLength ?? 150;

  // Send all chunks in one batch per BATCH_SIZE to stay within Ollama's
  // per-request limits while still getting a single round-trip per batch.
  const BATCH_SIZE = 20;
  for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
    const batch = chunks.slice(batchStart, batchStart + BATCH_SIZE);

    const texts = batch.map((c) =>
      truncateToContextLength(c.content, effectiveContextLength),
    );

    let vectors: number[][];
    try {
      if (isGemini) {
        const apiKey = await getGoogleApiKey(orgId);
        if (!apiKey) continue;
        vectors = await embedWithGoogle(apiKey, orgConfig.embeddingModel, texts);
      } else {
        vectors = await embedWithOllama(orgConfig.embeddingModel, texts);
      }
    } catch (err) {
      console.warn(
        `embedChunksForDocument: embed failed for batch ${batchStart}–${batchStart + batch.length - 1}`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }

    if (dimension != null && vectors[0]?.length !== dimension) {
      console.warn(
        `embedChunksForDocument: embedding dimension mismatch — got ${vectors[0]?.length}, registry says ${dimension}. Skipping batch.`,
      );
      continue;
    }

    // Sequential updates to avoid batch failures (e.g. connection pool or lock contention with parallel updates).
    // Using update (not upsert) to avoid triggering the INSERT RLS policy on existing rows.
    let failures = 0;
    for (let i = 0; i < batch.length; i++) {
      const chunk = batch[i];
      const embedding = vectors[i];
      if (!embedding) continue;
      const r = await supabase
        .from("document_chunks")
        .update({
          embedding,
          embedding_version: version,
          embedding_model: orgConfig.embeddingModel,
        })
        .eq("id", chunk.id);
      if (r.error) {
        failures++;
        if (failures === 1) {
          console.warn(
            `embedChunksForDocument: chunk update failed (batch ${batchStart}–${batchStart + batch.length - 1})`,
            r.error?.code,
            r.error?.message,
          );
        }
      }
    }
    if (failures > 0) {
      console.warn(
        `embedChunksForDocument: ${failures}/${batch.length} updates failed in batch ${batchStart}–${batchStart + batch.length - 1}`,
      );
    }
  }
}

type ReindexChunksArgs = {
  orgId: string;
  documentId: string;
  fromVersion: number;
  toVersion: number;
};

/**
 * Soft-migration re-embed: reads chunks at `fromVersion`, re-embeds them with the org's
 * current model, and INSERTs new rows at `toVersion`. Old rows are preserved for rollback.
 */
export async function reindexChunksForDocument(args: ReindexChunksArgs): Promise<void> {
  const { orgId, documentId, fromVersion, toVersion } = args;

  const supabase = await createSupabaseServerClient();
  const orgConfig = await getOrgModelConfig(orgId);

  if (!orgConfig.embeddingModel?.trim()) {
    console.warn("reindexChunksForDocument: no embedding model configured, skipping");
    return;
  }

  const isOllama = orgConfig.embeddingProvider === "ollama";
  const isGemini = orgConfig.embeddingProvider === "gemini";
  if (!isOllama && !isGemini) {
    console.warn("reindexChunksForDocument: unsupported embedding provider, skipping");
    return;
  }

  if (isGemini) {
    const apiKey = await getGoogleApiKey(orgId);
    if (!apiKey) {
      console.warn(
        "reindexChunksForDocument: Gemini embedding selected but no Google API key (org secret or GEMINI_API_KEY)",
      );
      return;
    }
  }

  const { data: chunks, error: fetchError } = await supabase
    .from("document_chunks")
    .select("org_id, document_id, knowledge_space_id, chunk_index, content")
    .eq("org_id", orgId)
    .eq("document_id", documentId)
    .eq("embedding_version", fromVersion)
    .order("chunk_index", { ascending: true });

  if (fetchError) {
    console.warn("reindexChunksForDocument: failed to fetch source chunks", fetchError.message);
    return;
  }

  if (!chunks?.length) {
    return;
  }

  const { dimension, contextLength } = await getEmbeddingModelMeta(
    orgConfig.embeddingProvider,
    orgConfig.embeddingModel,
  );

  const effectiveContextLength = contextLength ?? 512;

  const BATCH_SIZE = 20;
  for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
    const batch = chunks.slice(batchStart, batchStart + BATCH_SIZE);
    const texts = batch.map((c) =>
      truncateToContextLength(c.content, effectiveContextLength),
    );

    let vectors: number[][];
    try {
      if (isGemini) {
        const apiKey = await getGoogleApiKey(orgId);
        if (!apiKey) continue;
        vectors = await embedWithGoogle(apiKey, orgConfig.embeddingModel, texts);
      } else {
        vectors = await embedWithOllama(orgConfig.embeddingModel, texts);
      }
    } catch (err) {
      console.warn(
        `reindexChunksForDocument: embed failed for batch ${batchStart}–${batchStart + batch.length - 1}`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }

    if (dimension != null && vectors[0]?.length !== dimension) {
      console.warn(
        `reindexChunksForDocument: embedding dimension mismatch — got ${vectors[0]?.length}, registry says ${dimension}. Skipping batch.`,
      );
      continue;
    }

    const newRows = batch
      .map((chunk, i) => {
        const embedding = vectors[i];
        if (!embedding) return null;
        return {
          org_id: chunk.org_id,
          document_id: chunk.document_id,
          knowledge_space_id: chunk.knowledge_space_id,
          chunk_index: chunk.chunk_index,
          content: chunk.content,
          embedding,
          embedding_version: toVersion,
          embedding_model: orgConfig.embeddingModel,
        };
      })
      .filter(Boolean);

    if (newRows.length === 0) continue;

    const { error: insertError } = await supabase.from("document_chunks").insert(newRows);
    if (insertError) {
      console.warn(
        `reindexChunksForDocument: failed to insert new version rows in batch starting at ${batchStart}`,
        insertError.message,
      );
    }
  }
}

/**
 * Embeds a single query string using the org's configured embedding model.
 * Used by RAG retrieval for similarity search when the match_document_chunks RPC is unavailable.
 */
export async function embedQueryForOrg(
  orgId: string,
  query: string,
): Promise<number[] | null> {
  const orgConfig = await getOrgModelConfig(orgId);

  if (!orgConfig.embeddingModel?.trim()) {
    return null;
  }

  const isOllama = orgConfig.embeddingProvider === "ollama";
  const isGemini = orgConfig.embeddingProvider === "gemini";
  if (!isOllama && !isGemini) {
    return null;
  }

  try {
    if (isGemini) {
      const apiKey = await getGoogleApiKey(orgId);
      if (!apiKey) return null;
      const vectors = await embedWithGoogle(apiKey, orgConfig.embeddingModel, [query]);
      return vectors[0] ?? null;
    }
    const vectors = await embedWithOllama(orgConfig.embeddingModel, [query]);
    return vectors[0] ?? null;
  } catch {
    return null;
  }
}
