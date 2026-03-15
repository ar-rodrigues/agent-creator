import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * In-house concurrency limiter (no Node built-ins) so Next.js/Turbopack can bundle.
 * Runs at most `concurrency` async tasks at a time; same API as p-limit's limit(fn).
 */
function createConcurrencyLimit(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const runNext = () => {
    if (active < concurrency && queue.length > 0) {
      const next = queue.shift()!;
      next();
    }
  };

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = async () => {
        active++;
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          active--;
          runNext();
        }
      };

      if (active < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}
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
  dimensionConfigurable: boolean;
  allowedDimensions: number[] | null;
  /** Max tokens per input. Used to truncate chunks before sending to Ollama. */
  contextLength: number | null;
  /** Model id sent to the provider API; same column for all providers (backfilled from name where needed). */
  apiModelId: string | null;
};

/**
 * Fetches dimension, dimension_configurable, allowed_dimensions, context_length, and api_model_id for a provider+model from the registry.
 */
async function getEmbeddingModelMeta(
  provider: string,
  modelName: string,
): Promise<EmbeddingModelMeta> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("embedding_models")
    .select("dimension, dimension_configurable, allowed_dimensions, context_length, api_model_id")
    .eq("provider", provider)
    .eq("name", modelName)
    .eq("kind", "embedding")
    .maybeSingle();

  const allowedDimensions = Array.isArray(data?.allowed_dimensions)
    ? (data.allowed_dimensions as number[]).filter((n) => typeof n === "number")
    : null;

  return {
    dimension: (data?.dimension as number | null) ?? null,
    dimensionConfigurable: !!data?.dimension_configurable,
    allowedDimensions: allowedDimensions?.length ? allowedDimensions : null,
    contextLength: (data?.context_length as number | null) ?? null,
    apiModelId: (data?.api_model_id as string | null) ?? null,
  };
}

function getEffectiveDimension(
  registryDimension: number | null,
  dimensionConfigurable: boolean,
  orgOverride: number | null,
): number | null {
  if (dimensionConfigurable && orgOverride != null && orgOverride > 0) {
    return orgOverride;
  }
  return registryDimension;
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
 * When dimension is provided (for configurable models), requests that output size.
 * Falls back to one-by-one processing with progressive truncation if the
 * batch call fails (e.g. a single item still exceeds the context window
 * after pre-truncation).
 */
async function embedWithOllama(
  model: string,
  inputs: string[],
  dimension?: number,
): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const body: { model: string; input: string[]; dimensions?: number } = {
    model,
    input: inputs,
  };
  if (dimension != null && dimension > 0) {
    body.dimensions = dimension;
  }

  const res = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
    results.push(await embedOneWithOllama(model, input, dimension));
  }
  return results;
}

/**
 * Single-item embed with progressive truncation on context-length errors.
 * Only called as fallback when the batch request fails.
 */
async function embedOneWithOllama(
  model: string,
  input: string,
  dimension?: number,
): Promise<number[]> {
  let text = input;
  const MAX_ATTEMPTS = 4;

  const body: { model: string; input: string; dimensions?: number } = {
    model,
    input: text,
  };
  if (dimension != null && dimension > 0) {
    body.dimensions = dimension;
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    body.input = text;
    const res = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

const EMBED_API_BATCH_SIZE_LOW = 20;
const EMBED_API_BATCH_SIZE_HIGH = 50;
const EMBEDDING_RPC_BATCH_SIZE = 100;
const DEFAULT_LOCAL_CONCURRENCY = 6;
const MAX_EMBED_RETRIES = 3;
const RETRY_BASE_MS = 2000;
const EMBEDDING_RPC_MIN_SPLIT_SIZE = 10;
const REINDEX_INSERT_BATCH_SIZE = 100;
const REINDEX_INSERT_MIN_SPLIT_SIZE = 10;
const MISSING_RPC_CODES = new Set(["PGRST202", "42883"]);

let warnedMissingEmbeddingRpc = false;

function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("429") ||
    m.includes("rate limit") ||
    m.includes("resource exhausted") ||
    m.includes("quota exceeded") ||
    m.includes("too many requests")
  );
}

/**
 * Runs embedFn and retries on 429/rate-limit with exponential backoff.
 */
async function embedWithRetry<T>(embedFn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_EMBED_RETRIES; attempt++) {
    try {
      return await embedFn();
    } catch (err) {
      lastErr = err;
      if (!isRateLimitError(err) || attempt === MAX_EMBED_RETRIES) throw err;
      const delayMs = Math.min(
        RETRY_BASE_MS * Math.pow(2, attempt),
        10000,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

type TierProbeArgs = {
  orgId: string;
  isGemini: boolean;
  embeddingModel: string;
  probeTexts: string[];
};

/**
 * Probes embed API with 1, then 2, then 4 concurrent requests. Returns the safe
 * concurrency limit (1, 2, 4, or 6) for this upload only; nothing is persisted.
 */
async function runTierProbe(args: TierProbeArgs): Promise<number> {
  const { orgId, isGemini, embeddingModel, probeTexts } = args;
  const apiKey = isGemini ? await getGoogleApiKey(orgId) : null;
  if (isGemini && !apiKey) return 1;

  const doOneEmbed = async (): Promise<number[][]> => {
    if (isGemini && apiKey) {
      return embedWithGoogle(apiKey, embeddingModel, probeTexts);
    }
    return embedWithOllama(embeddingModel, probeTexts);
  };

  try {
    await doOneEmbed();
  } catch (e) {
    if (isRateLimitError(e)) return 1;
    throw e;
  }

  try {
    await Promise.all([doOneEmbed(), doOneEmbed()]);
  } catch (e) {
    if (isRateLimitError(e)) return 2;
    throw e;
  }

  try {
    await Promise.all([
      doOneEmbed(),
      doOneEmbed(),
      doOneEmbed(),
      doOneEmbed(),
    ]);
  } catch (e) {
    if (isRateLimitError(e)) return 4;
    throw e;
  }

  return 6;
}

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
 * Calls Google Generative Language API embedContent (single or batch) for the given model.
 * The model id is always from the registry api_model_id (same pattern as Ollama and other providers).
 * When dimension is provided, sends outputDimensionality so Gemini returns that size (e.g. 768).
 */
async function embedWithGoogle(
  apiKey: string,
  model: string,
  inputs: string[],
  dimension?: number,
): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const modelPath = model.startsWith("models/") ? model : `models/${model}`;
  const outputDim =
    dimension != null && Number.isInteger(dimension) && dimension > 0
      ? dimension
      : undefined;

  if (inputs.length === 1) {
    const url = new URL(`${GEMINI_EMBED_BASE}/${modelPath}:embedContent`);
    url.searchParams.set("key", apiKey);
    const body: { content: { parts: [{ text: string }] }; outputDimensionality?: number } = {
      content: { parts: [{ text: inputs[0] }] },
    };
    if (outputDim != null) body.outputDimensionality = outputDim;
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
  const batchBody = {
    requests: inputs.map((text) => {
      const req: { model: string; content: { parts: [{ text: string }] }; outputDimensionality?: number } = {
        model: modelPath,
        content: { parts: [{ text }] },
      };
      if (outputDim != null) req.outputDimensionality = outputDim;
      return req;
    }),
  };
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batchBody),
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

  const meta = await getEmbeddingModelMeta(
    orgConfig.embeddingProvider,
    orgConfig.embeddingModel,
  );
  const { contextLength } = meta;
  const effectiveDimension = getEffectiveDimension(
    meta.dimension,
    meta.dimensionConfigurable,
    orgConfig.embeddingDimension,
  );
  const embeddingApiModelId =
    meta.apiModelId?.trim() || orgConfig.embeddingModel;

  // Use registry context length; fall back to 150 tokens as a conservative
  // default for the smallest observed working size with local Ollama models.
  const effectiveContextLength = contextLength ?? 150;

  // Resolve concurrency: local (Ollama) uses high default; cloud runs tier probe every time.
  let concurrency: number;
  if (isOllama) {
    concurrency = DEFAULT_LOCAL_CONCURRENCY;
  } else {
    const probeTexts = chunks
      .slice(0, 5)
      .map((c) => truncateToContextLength(c.content, effectiveContextLength));
    if (probeTexts.length === 0) {
      concurrency = 1;
    } else {
      concurrency = await runTierProbe({
        orgId,
        isGemini,
        embeddingModel: embeddingApiModelId,
        probeTexts,
      });
    }
  }

  const effectiveBatchSize =
    concurrency >= 4 || isOllama
      ? EMBED_API_BATCH_SIZE_HIGH
      : EMBED_API_BATCH_SIZE_LOW;

  const geminiApiKey = isGemini ? await getGoogleApiKey(orgId) : null;

  const limit = createConcurrencyLimit(concurrency);

  type BatchResult = {
    embedApiMs: number;
    dbRpcMs: number;
    updated: number;
    failed: number;
    rpcCalls: number;
  };

  const tEmbedStart = Date.now();
  const batchStarts: number[] = [];
  for (let i = 0; i < chunks.length; i += effectiveBatchSize) {
    batchStarts.push(i);
  }

  const runOneBatch = async (batchStart: number): Promise<BatchResult> => {
    const batch = chunks.slice(
      batchStart,
      batchStart + effectiveBatchSize,
    );
    const texts = batch.map((c) =>
      truncateToContextLength(c.content, effectiveContextLength),
    );

    const tApiStart = Date.now();
    let vectors: number[][];
    try {
      vectors = await embedWithRetry(async () => {
        if (isGemini && geminiApiKey) {
          return embedWithGoogle(
            geminiApiKey,
            embeddingApiModelId,
            texts,
            effectiveDimension ?? undefined,
          );
        }
        return embedWithOllama(
          orgConfig.embeddingModel,
          texts,
          effectiveDimension ?? undefined,
        );
      });
    } catch (err) {
      console.warn(
        `embedChunksForDocument: embed failed for batch ${batchStart}–${batchStart + batch.length - 1}`,
        err instanceof Error ? err.message : err,
      );
      return {
        embedApiMs: Date.now() - tApiStart,
        dbRpcMs: 0,
        updated: 0,
        failed: 0,
        rpcCalls: 0,
      };
    }
    const embedApiMs = Date.now() - tApiStart;

    if (effectiveDimension != null && vectors[0]?.length !== effectiveDimension) {
      console.warn(
        `embedChunksForDocument: embedding dimension mismatch — got ${vectors[0]?.length}, expected ${effectiveDimension}. Skipping batch.`,
      );
      return { embedApiMs, dbRpcMs: 0, updated: 0, failed: 0, rpcCalls: 0 };
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
      const result = await updateEmbeddingsViaRpcWithFallback(
        supabase,
        updateBatch,
      );
      batchUpdated += result.updated;
      batchFailed += result.failed;
      batchRpcCalls += result.rpcCalls;
    }
    const dbRpcMs = Date.now() - tDbStart;

    if (batchFailed > 0) {
      console.warn(
        `embedChunksForDocument: ${batchFailed}/${rowsToUpdate.length} RPC updates failed in batch ${batchStart}–${batchStart + batch.length - 1}`,
      );
    }
    return {
      embedApiMs,
      dbRpcMs,
      updated: batchUpdated,
      failed: batchFailed,
      rpcCalls: batchRpcCalls,
    };
  };

  const results = await Promise.all(
    batchStarts.map((batchStart) => limit(() => runOneBatch(batchStart))),
  );

  const totalEmbedApiMs = results.reduce((s, r) => s + r.embedApiMs, 0);
  const totalDbRpcMs = results.reduce((s, r) => s + r.dbRpcMs, 0);
  const totalDbUpdated = results.reduce((s, r) => s + r.updated, 0);
  const totalDbFailed = results.reduce((s, r) => s + r.failed, 0);
  const totalRpcCalls = results.reduce((s, r) => s + r.rpcCalls, 0);
  const totalMs = Date.now() - tEmbedStart;
  console.log(
    `[upload:embedding] documentId=${documentId} concurrency=${concurrency} batchSize=${effectiveBatchSize} totalMs=${totalMs} batchCount=${results.length} embedApiMs=${totalEmbedApiMs} dbRpcMs=${totalDbRpcMs} rpcCalls=${totalRpcCalls} dbUpdated=${totalDbUpdated} dbFailed=${totalDbFailed} chunkCount=${chunks.length}`,
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

  const meta = await getEmbeddingModelMeta(
    orgConfig.embeddingProvider,
    orgConfig.embeddingModel,
  );
  const { contextLength } = meta;
  const effectiveDimension = getEffectiveDimension(
    meta.dimension,
    meta.dimensionConfigurable,
    orgConfig.embeddingDimension,
  );
  const embeddingApiModelId =
    meta.apiModelId?.trim() || orgConfig.embeddingModel;

  const effectiveContextLength = contextLength ?? 512;

  // Same concurrency resolution as embedChunksForDocument: Ollama fixed, cloud probe every time.
  let concurrency: number;
  if (isOllama) {
    concurrency = DEFAULT_LOCAL_CONCURRENCY;
  } else {
    const probeTexts = chunks
      .slice(0, 5)
      .map((c) => truncateToContextLength(c.content, effectiveContextLength));
    if (probeTexts.length === 0) {
      concurrency = 1;
    } else {
      concurrency = await runTierProbe({
        orgId,
        isGemini,
        embeddingModel: embeddingApiModelId,
        probeTexts,
      });
    }
  }

  const effectiveBatchSize =
    concurrency >= 4 || isOllama
      ? EMBED_API_BATCH_SIZE_HIGH
      : EMBED_API_BATCH_SIZE_LOW;

  const geminiApiKey = isGemini ? await getGoogleApiKey(orgId) : null;
  const limit = createConcurrencyLimit(concurrency);

  const batchStarts: number[] = [];
  for (let i = 0; i < chunks.length; i += effectiveBatchSize) {
    batchStarts.push(i);
  }

  let totalInsertMs = 0;
  let totalInserted = 0;
  let totalInsertFailed = 0;
  let totalInsertCalls = 0;

  const runOneReindexBatch = async (
    batchStart: number,
  ): Promise<ReindexedChunkInsert[]> => {
    const batch = chunks.slice(
      batchStart,
      batchStart + effectiveBatchSize,
    );
    const texts = batch.map((c) =>
      truncateToContextLength(c.content, effectiveContextLength),
    );

    let vectors: number[][];
    try {
      vectors = await embedWithRetry(async () => {
        if (isGemini && geminiApiKey) {
          return embedWithGoogle(
            geminiApiKey,
            embeddingApiModelId,
            texts,
            effectiveDimension ?? undefined,
          );
        }
        return embedWithOllama(
          orgConfig.embeddingModel,
          texts,
          effectiveDimension ?? undefined,
        );
      });
    } catch (err) {
      console.warn(
        `reindexChunksForDocument: embed failed for batch ${batchStart}–${batchStart + batch.length - 1}`,
        err instanceof Error ? err.message : err,
      );
      return [];
    }

    if (effectiveDimension != null && vectors[0]?.length !== effectiveDimension) {
      console.warn(
        `reindexChunksForDocument: embedding dimension mismatch — got ${vectors[0]?.length}, expected ${effectiveDimension}. Skipping batch.`,
      );
      return [];
    }

    return batch
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
  };

  const allNewRows: ReindexedChunkInsert[][] = await Promise.all(
    batchStarts.map((batchStart) =>
      limit(() => runOneReindexBatch(batchStart)),
    ),
  );

  const pendingInserts: ReindexedChunkInsert[] = allNewRows.flat();

  for (let i = 0; i < pendingInserts.length; i += REINDEX_INSERT_BATCH_SIZE) {
    const insertBatch = pendingInserts.slice(
      i,
      i + REINDEX_INSERT_BATCH_SIZE,
    );
    const tInsertStart = Date.now();
    const insertResult = await insertReindexedRowsWithFallback(
      supabase,
      insertBatch,
    );
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
    `[reindex:embedding] documentId=${documentId} concurrency=${concurrency} batchSize=${effectiveBatchSize} fromVersion=${fromVersion} toVersion=${toVersion} insertMs=${totalInsertMs} insertCalls=${totalInsertCalls} inserted=${totalInserted} failed=${totalInsertFailed} chunkCount=${chunks.length}`,
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
      const meta = await getEmbeddingModelMeta(
        orgConfig.embeddingProvider,
        orgConfig.embeddingModel,
      );
      const effectiveDimension = getEffectiveDimension(
        meta.dimension,
        meta.dimensionConfigurable,
        orgConfig.embeddingDimension,
      );
      const apiModelId =
        meta.apiModelId?.trim() || orgConfig.embeddingModel;
      const vectors = await embedWithGoogle(
        apiKey,
        apiModelId,
        [query],
        effectiveDimension ?? undefined,
      );
      return vectors[0] ?? null;
    }
    const meta = await getEmbeddingModelMeta(
      orgConfig.embeddingProvider,
      orgConfig.embeddingModel,
    );
    const effectiveDimension = getEffectiveDimension(
      meta.dimension,
      meta.dimensionConfigurable,
      orgConfig.embeddingDimension,
    );
    const vectors = await embedWithOllama(
      orgConfig.embeddingModel,
      [query],
      effectiveDimension ?? undefined,
    );
    return vectors[0] ?? null;
  } catch {
    return null;
  }
}
