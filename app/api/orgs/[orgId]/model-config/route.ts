import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { getOrgModelConfig } from "@/lib/llm/orgConfig";

type Params = { params: Promise<{ orgId: string }> };

const REINDEX_FUNCTION =
  process.env.SUPABASE_RAG_REINDEX_FUNCTION ?? "reindex_org_embeddings";

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;
  if (!orgId) {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  }

  const canManage = await hasPermission(orgId, user.id, "ORG_MANAGE_MEMBERS");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await getOrgModelConfig(orgId);

  return NextResponse.json({
    config: {
      chatProvider: config.chatProvider,
      chatModel: config.chatModel,
      embeddingProvider: config.embeddingProvider,
      embeddingModel: config.embeddingModel,
      currentEmbeddingVersion: config.currentEmbeddingVersion,
      previousEmbeddingVersion: config.previousEmbeddingVersion,
      isDefault: false,
    },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;
  if (!orgId) {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  }

  const canManage = await hasPermission(orgId, user.id, "ORG_MANAGE_MEMBERS");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        chatProvider?: string;
        chatModel?: string | null;
        embeddingProvider?: string;
        embeddingModel?: string;
      }
    | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const chatProvider = body.chatProvider?.trim();
  const chatModel = body.chatModel?.trim() || null;
  const embeddingProvider = body.embeddingProvider?.trim();
  const embeddingModel = body.embeddingModel?.trim();

  if (!chatProvider || !embeddingProvider || !embeddingModel) {
    return NextResponse.json(
      { error: "chatProvider, embeddingProvider and embeddingModel are required" },
      { status: 400 },
    );
  }

  // Validate that requested models exist in the embedding_models registry.
  const { data: chatModelRow, error: chatLookupError } = await supabase
    .from("embedding_models")
    .select("id, provider, name, kind, is_enabled")
    .eq("provider", chatProvider)
    .eq("name", chatModel ?? "")
    .eq("kind", "chat")
    .maybeSingle();

  if (chatModel && (chatLookupError || !chatModelRow || !chatModelRow.is_enabled)) {
    return NextResponse.json(
      { error: "Selected chat model is not available or not enabled" },
      { status: 400 },
    );
  }

  const { data: embeddingModelRow, error: embeddingLookupError } = await supabase
    .from("embedding_models")
    .select("id, provider, name, kind, is_enabled, dimension")
    .eq("provider", embeddingProvider)
    .eq("name", embeddingModel)
    .eq("kind", "embedding")
    .maybeSingle();

  if (embeddingLookupError || !embeddingModelRow || !embeddingModelRow.is_enabled) {
    return NextResponse.json(
      { error: "Selected embedding model is not available or not enabled" },
      { status: 400 },
    );
  }

  const { data: existing, error: loadErr } = await supabase
    .from("org_model_configs")
    .select("org_id")
    .eq("org_id", orgId)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }

  const upsertPayload = {
    org_id: orgId,
    chat_provider: chatProvider,
    chat_model: chatModel,
    embedding_provider: embeddingProvider,
    embedding_model: embeddingModel,
  };

  const { error: upsertErr } = await supabase
    .from("org_model_configs")
    .upsert(upsertPayload, { onConflict: "org_id" });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // Fire-and-forget reindex trigger when embedding settings change.
  if (existing && embeddingModel) {
    void supabase.functions
      .invoke(REINDEX_FUNCTION, {
        body: {
          orgId,
          reason: "embeddingModelChanged",
        },
      })
      .catch((err) => {
        console.warn(
          "Failed to invoke reindex function",
          err instanceof Error ? err.message : err,
        );
      });
  }

  const config = await getOrgModelConfig(orgId);

  return NextResponse.json({
    config: {
      chatProvider: config.chatProvider,
      chatModel: config.chatModel,
      embeddingProvider: config.embeddingProvider,
      embeddingModel: config.embeddingModel,
      currentEmbeddingVersion: config.currentEmbeddingVersion,
      previousEmbeddingVersion: config.previousEmbeddingVersion,
      isDefault: false,
    },
  });
}

