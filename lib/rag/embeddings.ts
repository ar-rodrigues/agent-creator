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

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type ChunkEmbeddingUpdate = {
  id: string;
  embedding: number[];
  embeddingVersion: number;
  embeddingModel: string;
};

type ReindexedChunkInsert = {
  org_id: string;
  document_id: string;
  knowledge_space_id: string;
  chunk_index: number;
  content: string;
  embedding: number[];
  embedding_version: number;
  embedding_model: string;
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

/** Google API model id for display name "Gemini Embedding 2". */
const GEMINI_EMBEDDING_2_API_MODEL = "text-embedding-005";

const EMBED_API_BATCH_SIZE = 20;
const EMBEDDING_RPC_BATCH_SIZE = 100;
const EMBEDDING_RPC_MIN_SPLIT_SIZE = 10;
const REINDEX_INSERT_BATCH_SIZE = 100;
const REINDEX_INSERT_MIN_SPLIT_SIZE = 10;
const MISSING_RPC_CODES = new Set(["PGRST202", "42883"]);

let warnedMissingEmbeddingRpc = false;

function shouldFallbackToLegacyRpcUpdate(error: { code?: string; message?: string }): boolean {
  if (error.code != null && MISSING_RPC_CODES.has(error.code)) {
    return true;
  }
  const normalizedMessage = (error.message ?? "").toLowerCase();
  return (
    normalizedMessage.includes("could not find the function") ||
    normalizedMessage.includes("type \"vector\" does not exist") ||
    normalizedMessage.includes("function public.update_chunk_embeddings")
  );
}

/**
 * Resolves registry embedding model name to the model id used by the Google API.
 */
function resolveGeminiEmbedModel(registryName: string): string {
  if (registryName === "Gemini Embedding 2") return GEMINI_EMBEDDING_2_API_MODEL;
  return registryName;
}

/**
 * Calls Google Generative Language API embedContent (single or batch) for the given model.
 * Model name is from the registry (e.g. Gemini Embedding 2, text-embedding-005); display names are resolved to API ids.
 */
async function embedWithGoogle(
  apiKey: string,
  model: string,
  inputs: string[],
): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const apiModel = resolveGeminiEmbedModel(model);
  const modelPath = apiModel.startsWith("models/") ? apiModel : `models/${apiModel}`;

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

function buildEmbeddingRpcPayload(rows: ChunkEmbeddingUpdate[]) {
  return rows.map((row) => ({
    id: row.id,
    embedding: row.embedding,
    embedding_version: row.embeddingVersion,
    embedding_model: row.embeddingModel,
  }));
}

async function updateEmbeddingsViaRpcWithFallback(
  supabase: SupabaseServerClient,
  rows: ChunkEmbeddingUpdate[],
): Promise<{ updated: number; failed: number; rpcCalls: number }> {
  if (rows.length === 0) {
    return { updated: 0, failed: 0, rpcCalls: 0 };
  }

  const { data, error } = await supabase.rpc("update_chunk_embeddings", {
    payload: buildEmbeddingRpcPayload(rows),
  });

  if (!error) {
    const updated =
      typeof data === "number"
        ? Math.max(0, Math.min(data, rows.length))
        : rows.length;
    const failed = Math.max(0, rows.length - updated);
    return { updated, failed, rpcCalls: 1 };
  }

  if (shouldFallbackToLegacyRpcUpdate(error ?? {})) {
    if (!warnedMissingEmbeddingRpc) {
      warnedMissingEmbeddingRpc = true;
      console.warn(
        "update_chunk_embeddings RPC unavailable or incompatible, falling back to row-by-row updates. Apply latest Supabase migrations to enable fast bulk updates.",
      );
    }

    let updated = 0;
    let failed = 0;
    for (const row of rows) {
      const r = await supabase
        .from("document_chunks")
        .update({
          embedding: row.embedding,
          embedding_version: row.embeddingVersion,
          embedding_model: row.embeddingModel,
        })
        .eq("id", row.id);
      if (r.error) {
        failed++;
      } else {
        updated++;
      }
    }
    return { updated, failed, rpcCalls: 1 };
  }

  if (rows.length <= EMBEDDING_RPC_MIN_SPLIT_SIZE) {
    console.warn(
      "update_chunk_embeddings RPC failed for terminal batch",
      error.code,
      error.message,
      `batchSize=${rows.length}`,
    );
    return { updated: 0, failed: rows.length, rpcCalls: 1 };
  }

  const splitAt = Math.floor(rows.length / 2);
  const left = await updateEmbeddingsViaRpcWithFallback(supabase, rows.slice(0, splitAt));
  const right = await updateEmbeddingsViaRpcWithFallback(supabase, rows.slice(splitAt));
  return {
    updated: left.updated + right.updated,
    failed: left.failed + right.failed,
    rpcCalls: 1 + left.rpcCalls + right.rpcCalls,
  };
}

async function insertReindexedRowsWithFallback(
  supabase: SupabaseServerClient,
  rows: ReindexedChunkInsert[],
): Promise<{ inserted: number; failed: number; calls: number }> {
  if (rows.length === 0) {
    return { inserted: 0, failed: 0, calls: 0 };
  }

  const { error } = await supabase.from("document_chunks").insert(rows);
  if (!error) {
    return { inserted: rows.length, failed: 0, calls: 1 };
  }

  if (rows.length <= REINDEX_INSERT_MIN_SPLIT_SIZE) {
    console.warn(
      "reindexChunksForDocument: insert failed for terminal batch",
      error.code,
      error.message,
      `batchSize=${rows.length}`,
    );
    return { inserted: 0, failed: rows.length, calls: 1 };
  }

  const splitAt = Math.floor(rows.length / 2);
  const left = await insertReindexedRowsWithFallback(supabase, rows.slice(0, splitAt));
  const right = await insertReindexedRowsWithFallback(supabase, rows.slice(splitAt));
  return {
    inserted: left.inserted + right.inserted,
    failed: left.failed + right.failed,
    calls: 1 + left.calls + right.calls,
  };
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

  const tEmbedStart = Date.now();
  let totalEmbedApiMs = 0;
  let totalDbRpcMs = 0;
  let totalDbUpdated = 0;
  let totalDbFailed = 0;
  let totalRpcCalls = 0;
  let batchCount = 0;

  // Send all chunks in one batch per BATCH_SIZE to stay within Ollama's
  // per-request limits while still getting a single round-trip per batch.
  for (let batchStart = 0; batchStart < chunks.length; batchStart += EMBED_API_BATCH_SIZE) {
    const batch = chunks.slice(batchStart, batchStart + EMBED_API_BATCH_SIZE);

    const texts = batch.map((c) =>
      truncateToContextLength(c.content, effectiveContextLength),
    );

    const tApiStart = Date.now();
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
    totalEmbedApiMs += Date.now() - tApiStart;

    if (dimension != null && vectors[0]?.length !== dimension) {
      console.warn(
        `embedChunksForDocument: embedding dimension mismatch — got ${vectors[0]?.length}, registry says ${dimension}. Skipping batch.`,
      );
      continue;
    }

    const rowsToUpdate: ChunkEmbeddingUpdate[] = [];
    for (let i = 0; i < batch.length; i++) {
      const chunk = batch[i];
      const embedding = vectors[i];
      if (!embedding) continue;
      rowsToUpdate.push({
        id: chunk.id,
        embedding,
        embeddingVersion: version,
        embeddingModel: orgConfig.embeddingModel,
      });
    }

    const tDbStart = Date.now();
    let batchUpdated = 0;
    let batchFailed = 0;
    let batchRpcCalls = 0;

    for (
      let updateStart = 0;
      updateStart < rowsToUpdate.length;
      updateStart += EMBEDDING_RPC_BATCH_SIZE
    ) {
      const updateBatch = rowsToUpdate.slice(
        updateStart,
        updateStart + EMBEDDING_RPC_BATCH_SIZE,
      );
      const result = await updateEmbeddingsViaRpcWithFallback(supabase, updateBatch);
      batchUpdated += result.updated;
      batchFailed += result.failed;
      batchRpcCalls += result.rpcCalls;
    }

    totalDbRpcMs += Date.now() - tDbStart;
    totalDbUpdated += batchUpdated;
    totalDbFailed += batchFailed;
    totalRpcCalls += batchRpcCalls;
    batchCount++;

    if (batchFailed > 0) {
      console.warn(
        `embedChunksForDocument: ${batchFailed}/${rowsToUpdate.length} RPC updates failed in batch ${batchStart}–${batchStart + batch.length - 1}`,
      );
    }
  }

  const totalMs = Date.now() - tEmbedStart;
  console.log(
    `[upload:embedding] documentId=${documentId} totalMs=${totalMs} batchCount=${batchCount} embedApiMs=${totalEmbedApiMs} dbRpcMs=${totalDbRpcMs} rpcCalls=${totalRpcCalls} dbUpdated=${totalDbUpdated} dbFailed=${totalDbFailed} chunkCount=${chunks.length}`,
  );
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

  let totalInsertMs = 0;
  let totalInserted = 0;
  let totalInsertFailed = 0;
  let totalInsertCalls = 0;
  const pendingInserts: ReindexedChunkInsert[] = [];

  for (let batchStart = 0; batchStart < chunks.length; batchStart += EMBED_API_BATCH_SIZE) {
    const batch = chunks.slice(batchStart, batchStart + EMBED_API_BATCH_SIZE);
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
      .filter((row): row is ReindexedChunkInsert => row != null);

    if (newRows.length === 0) continue;
    pendingInserts.push(...newRows);

    while (pendingInserts.length >= REINDEX_INSERT_BATCH_SIZE) {
      const insertBatch = pendingInserts.splice(0, REINDEX_INSERT_BATCH_SIZE);
      const tInsertStart = Date.now();
      const insertResult = await insertReindexedRowsWithFallback(supabase, insertBatch);
      totalInsertMs += Date.now() - tInsertStart;
      totalInserted += insertResult.inserted;
      totalInsertFailed += insertResult.failed;
      totalInsertCalls += insertResult.calls;
    }
  }

  if (pendingInserts.length > 0) {
    const tInsertStart = Date.now();
    const insertResult = await insertReindexedRowsWithFallback(supabase, pendingInserts);
    totalInsertMs += Date.now() - tInsertStart;
    totalInserted += insertResult.inserted;
    totalInsertFailed += insertResult.failed;
    totalInsertCalls += insertResult.calls;
  }

  if (totalInsertFailed > 0) {
    console.warn(
      `reindexChunksForDocument: failed to insert ${totalInsertFailed} rows for document ${documentId}`,
    );
  }

  console.log(
    `[reindex:embedding] documentId=${documentId} fromVersion=${fromVersion} toVersion=${toVersion} insertMs=${totalInsertMs} insertCalls=${totalInsertCalls} inserted=${totalInserted} failed=${totalInsertFailed} chunkCount=${chunks.length}`,
  );
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
