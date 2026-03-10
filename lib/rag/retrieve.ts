import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RagChunk = {
  id: string;
  document_id: string;
  knowledge_space_id: string;
  chunk_index: number;
  content: string;
  created_at: string;
};

export type RagRetrieveOptions = {
  orgId: string;
  knowledgeSpaceIds: string[];
  query: string;
  limit?: number;
};

/**
 * Org-scoped RAG retrieval: returns text chunks from document_chunks
 * filtered by org and the given knowledge space IDs.
 * Embedding-based similarity search can be added later; for now
 * returns recent chunks from the given spaces (stub implementation).
 */
export async function retrieveRagChunks(
  options: RagRetrieveOptions,
): Promise<RagChunk[]> {
  const { orgId, knowledgeSpaceIds, limit = 10 } = options;

  if (knowledgeSpaceIds.length === 0) {
    return [];
  }

  const supabase = await createSupabaseServerClient();

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
