import { createSupabaseServerClient } from "@/lib/supabase/server";

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
   * When omitted, the Edge Function should default to the org's active version.
   */
  embeddingVersion?: number;
};

const MATCH_FUNCTION =
  process.env.SUPABASE_RAG_MATCH_FUNCTION ?? "match_document_chunks";

export async function retrieveRelevantChunks(
  options: RagRetrieveOptions,
): Promise<RagChunk[]> {
  const { orgId, knowledgeSpaceIds, query, limit = 10, embeddingVersion } = options;

  if (!query.trim() || knowledgeSpaceIds.length === 0) {
    return [];
  }

  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase.rpc(MATCH_FUNCTION, {
      org_id: orgId,
      knowledge_space_ids: knowledgeSpaceIds,
      query,
      match_limit: limit,
      embedding_version: embeddingVersion,
    });

    if (error) {
      console.warn("RAG match function error, falling back to recency:", error.message);
      return await fallbackRecentChunks(supabase, orgId, knowledgeSpaceIds, limit);
    }

    return (data ?? []) as RagChunk[];
  } catch (err) {
    console.warn(
      "RAG retrieval failed, falling back to recency:",
      err instanceof Error ? err.message : err,
    );
    return await fallbackRecentChunks(supabase, orgId, knowledgeSpaceIds, limit);
  }
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

