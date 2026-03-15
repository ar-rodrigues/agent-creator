import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OrgModelConfig = {
  chatProvider: string;
  chatModel: string | null;
  /** Model id sent to the chat provider API; from registry api_model_id (same pattern as embedding). */
  chatApiModelId: string | null;
  embeddingProvider: string;
  embeddingModel: string;
  /** Org override for embedding dimension when the selected model is dimension_configurable; null = use registry default. */
  embeddingDimension: number | null;
  currentEmbeddingVersion: number;
  previousEmbeddingVersion: number | null;
  reindexStatus: "idle" | "in_progress" | "error";
};

const DEFAULT_CHAT_PROVIDER = process.env.LLM_PROVIDER ?? "local";
const DEFAULT_CHAT_MODEL = process.env.LLM_MODEL ?? "";

// For embeddings we no longer default to a Supabase-specific provider/model.
// Provider defaults to "local" unless explicitly overridden by env.
const DEFAULT_EMBEDDING_PROVIDER =
  process.env.SUPABASE_RAG_EMBEDDINGS_PROVIDER ?? "local";
// Model defaults to empty so the UI behaves like the chat model selector
// (no pre-selected value until the user chooses one from the list).
const DEFAULT_EMBEDDING_MODEL =
  process.env.SUPABASE_RAG_EMBEDDINGS_MODEL ?? "";

export async function getOrgModelConfig(orgId: string): Promise<OrgModelConfig> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("org_model_configs")
    .select(
      "chat_provider, chat_model, embedding_provider, embedding_model, embedding_dimension, current_embedding_version, previous_embedding_version, reindex_status",
    )
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    console.warn(
      "Failed to load org_model_configs; falling back to environment defaults",
      error.message,
    );
  }

  if (!data) {
    const fallbackChat = DEFAULT_CHAT_MODEL || null;
    return {
      chatProvider: DEFAULT_CHAT_PROVIDER,
      chatModel: fallbackChat,
      chatApiModelId: fallbackChat,
      embeddingProvider: DEFAULT_EMBEDDING_PROVIDER,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
      embeddingDimension: null,
      currentEmbeddingVersion: 1,
      previousEmbeddingVersion: null,
      reindexStatus: "idle",
    };
  }

  let chatApiModelId: string | null = data.chat_model ?? (DEFAULT_CHAT_MODEL || null);
  if (data.chat_model && data.chat_provider) {
    const { data: chatRow } = await supabase
      .from("embedding_models")
      .select("api_model_id")
      .eq("provider", data.chat_provider)
      .eq("name", data.chat_model)
      .eq("kind", "chat")
      .maybeSingle();
    const id = (chatRow?.api_model_id as string | null)?.trim();
    if (id) chatApiModelId = id;
  }

  const embeddingDimension =
    typeof data.embedding_dimension === "number" ? data.embedding_dimension : null;

  return {
    chatProvider: data.chat_provider || DEFAULT_CHAT_PROVIDER,
    chatModel: data.chat_model ?? (DEFAULT_CHAT_MODEL || null),
    chatApiModelId,
    embeddingProvider: data.embedding_provider || DEFAULT_EMBEDDING_PROVIDER,
    embeddingModel: data.embedding_model || DEFAULT_EMBEDDING_MODEL,
    embeddingDimension,
    currentEmbeddingVersion: data.current_embedding_version ?? 1,
    previousEmbeddingVersion: data.previous_embedding_version ?? null,
    reindexStatus: (data.reindex_status as "idle" | "in_progress" | "error") ?? "idle",
  };
}

