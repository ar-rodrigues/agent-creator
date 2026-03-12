import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OrgModelConfig = {
  chatProvider: string;
  chatModel: string | null;
  embeddingProvider: string;
  embeddingModel: string;
  currentEmbeddingVersion: number;
  previousEmbeddingVersion: number | null;
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
      "chat_provider, chat_model, embedding_provider, embedding_model, current_embedding_version, previous_embedding_version",
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
    return {
      chatProvider: DEFAULT_CHAT_PROVIDER,
      chatModel: DEFAULT_CHAT_MODEL || null,
      embeddingProvider: DEFAULT_EMBEDDING_PROVIDER,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
      currentEmbeddingVersion: 1,
      previousEmbeddingVersion: null,
    };
  }

  return {
    chatProvider: data.chat_provider || DEFAULT_CHAT_PROVIDER,
    chatModel: data.chat_model ?? (DEFAULT_CHAT_MODEL || null),
    embeddingProvider: data.embedding_provider || DEFAULT_EMBEDDING_PROVIDER,
    embeddingModel: data.embedding_model || DEFAULT_EMBEDDING_MODEL,
    currentEmbeddingVersion: data.current_embedding_version ?? 1,
    previousEmbeddingVersion: data.previous_embedding_version ?? null,
  };
}

