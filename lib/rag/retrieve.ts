import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgModelConfig } from "@/lib/llm/orgConfig";
import { embedQueryForOrg } from "@/lib/rag/embeddings";

export type RagChunk = {
  id: string;
  document_id: string;
  knowledge_space_id: string;
  chunk_index: number;
  content: string;
  created_at: string;
  score?: number | null;
};

export type RagRetrieveOptions = {
  orgId: string;
  knowledgeSpaceIds: string[];
  query: string;
  limit?: number;
  /**
   * Embedding version to use for similarity search.
   * When omitted, the org's active version is used.
   */
  embeddingVersion?: number;
};

const MATCH_FUNCTION =
  process.env.SUPABASE_RAG_MATCH_FUNCTION ?? "match_document_chunks";

/** Cosine similarity for unit vectors (Ollama returns L2-normalized). */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export async function retrieveRelevantChunks(
  options: RagRetrieveOptions,
): Promise<RagChunk[]> {
  const { orgId, knowledgeSpaceIds, query, limit = 10, embeddingVersion } = options;

  if (!query.trim() || knowledgeSpaceIds.length === 0) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const orgConfig = await getOrgModelConfig(orgId);
  const version = embeddingVersion ?? orgConfig.currentEmbeddingVersion ?? 1;

  // Embed the query on the app side — Postgres cannot call Ollama directly.
  const queryEmbedding = await embedQueryForOrg(orgId, query);

  if (queryEmbedding?.length) {
    try {
      const { data, error } = await supabase.rpc(MATCH_FUNCTION, {
        org_id: orgId,
        knowledge_space_ids: knowledgeSpaceIds,
        query_embedding: queryEmbedding,
        match_limit: limit,
        embedding_version: version,
      });

      if (!error && (data ?? []).length > 0) {
        return data as RagChunk[];
      }

      if (error) {
        console.warn("RAG match function error, trying in-app similarity:", error.message);
      }
      // 0 results from RPC (chunks not yet embedded) → fall through to in-app / fallback
    } catch (err) {
      console.warn(
        "RAG retrieval failed, trying in-app similarity:",
        err instanceof Error ? err.message : err,
      );
    }

    // In-app similarity reuses the already-computed embedding.
    const inApp = await similaritySearchInApp({
      supabase,
      orgId,
      knowledgeSpaceIds,
      limit,
      version,
      queryEmbedding,
    });
    if (inApp.length > 0) return inApp;
  } else {
    // Embedding unavailable — try full in-app path (will re-embed internally).
    try {
      const inApp = await similaritySearchInApp({
        supabase,
        orgId,
        knowledgeSpaceIds,
        query,
        limit,
        version,
      });
      if (inApp.length > 0) return inApp;
    } catch {
      // ignore, fall through to recent chunks
    }
  }

  return await fallbackRecentChunks(supabase, orgId, knowledgeSpaceIds, limit);
}

type SimilaritySearchParams = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  orgId: string;
  knowledgeSpaceIds: string[];
  limit: number;
  version: number;
  /** Pass already-computed embedding to avoid re-embedding. */
  queryEmbedding?: number[];
  /** Raw query text — used only when queryEmbedding is not provided. */
  query?: string;
};

async function similaritySearchInApp(
  params: SimilaritySearchParams,
): Promise<RagChunk[]> {
  const { supabase, orgId, knowledgeSpaceIds, limit, version } = params;

  let queryVector = params.queryEmbedding ?? null;

  if (!queryVector?.length && params.query) {
    queryVector = await embedQueryForOrg(orgId, params.query);
  }

  if (!queryVector?.length) {
    return [];
  }

  const { data: rows, error } = await supabase
    .from("document_chunks")
    .select("id, document_id, knowledge_space_id, chunk_index, content, created_at, embedding")
    .eq("org_id", orgId)
    .in("knowledge_space_id", knowledgeSpaceIds)
    .eq("embedding_version", version)
    .not("embedding", "is", null);

  if (error || !rows?.length) {
    return [];
  }

  const withScores = rows
    .map((row) => {
      let embedding = row.embedding as number[] | string | null;
      if (embedding == null) return null;
      if (typeof embedding === "string") {
        try {
          embedding = JSON.parse(embedding) as number[];
        } catch {
          return null;
        }
      }
      if (!Array.isArray(embedding)) return null;
      const score = cosineSimilarity(queryVector!, embedding);
      return {
        id: row.id,
        document_id: row.document_id,
        knowledge_space_id: row.knowledge_space_id,
        chunk_index: row.chunk_index,
        content: row.content,
        created_at: row.created_at,
        score,
      } as RagChunk;
    })
    .filter((c): c is RagChunk => c != null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);

  return withScores;
}

async function fallbackRecentChunks(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  orgId: string,
  knowledgeSpaceIds: string[],
  limit: number,
): Promise<RagChunk[]> {
  const { data, error } = await supabase
    .from("document_chunks")
    .select("id, document_id, knowledge_space_id, chunk_index, content, created_at")
    .eq("org_id", orgId)
    .in("knowledge_space_id", knowledgeSpaceIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message ?? "RAG retrieval failed");
  }

  return (data ?? []) as RagChunk[];
}

export function buildRagContextFromChunks(chunks: RagChunk[]): string {
  if (!chunks.length) return "";

  const lines: string[] = [];
  for (const chunk of chunks) {
    const headerParts = [
      `Document: ${chunk.document_id}`,
      `Space: ${chunk.knowledge_space_id}`,
      `Index: ${chunk.chunk_index}`,
    ];
    if (typeof chunk.score === "number") {
      headerParts.push(`Score: ${chunk.score.toFixed(3)}`);
    }
    lines.push(`---\n${headerParts.join(" | ")}\n${chunk.content}`);
  }
  return lines.join("\n\n");
}
