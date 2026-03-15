import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { getOrgModelConfig } from "@/lib/llm/orgConfig";

type Params = { params: Promise<{ orgId: string }> };

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

  let embeddingDimensionConfigurable = false;
  let embeddingDimensionDefault = 0;
  let embeddingDimensionAllowed: number[] | undefined;

  if (config.embeddingProvider && config.embeddingModel) {
    const { data: embedRow } = await supabase
      .from("embedding_models")
      .select("dimension, dimension_configurable, allowed_dimensions")
      .eq("provider", config.embeddingProvider)
      .eq("name", config.embeddingModel)
      .eq("kind", "embedding")
      .maybeSingle();
    if (embedRow) {
      embeddingDimensionConfigurable = !!embedRow.dimension_configurable;
      embeddingDimensionDefault = (embedRow.dimension as number) ?? 0;
      if (Array.isArray(embedRow.allowed_dimensions) && embedRow.allowed_dimensions.length > 0) {
        embeddingDimensionAllowed = (embedRow.allowed_dimensions as number[]).filter(
          (n) => typeof n === "number",
        );
      }
    }
  }

  return NextResponse.json({
    config: {
      chatProvider: config.chatProvider,
      chatModel: config.chatModel,
      embeddingProvider: config.embeddingProvider,
      embeddingModel: config.embeddingModel,
      embeddingDimension: config.embeddingDimension,
      embeddingDimensionConfigurable,
      embeddingDimensionDefault,
      embeddingDimensionAllowed,
      currentEmbeddingVersion: config.currentEmbeddingVersion,
      previousEmbeddingVersion: config.previousEmbeddingVersion,
      reindexStatus: config.reindexStatus,
      isDefault: false,
    },
  });
}

const DEFAULT_ALLOWED_DIMENSIONS = [256, 384, 512, 768, 1024, 1536, 2048, 3072];

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
        embeddingDimension?: number | null;
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
    .select("id, provider, name, kind, is_enabled, dimension, dimension_configurable, allowed_dimensions")
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

  const embeddingDimension =
    body.embeddingDimension !== undefined
      ? (typeof body.embeddingDimension === "number" && body.embeddingDimension > 0
          ? body.embeddingDimension
          : null)
      : undefined;

  if (embeddingDimension !== undefined && embeddingDimension !== null) {
    const dimensionConfigurable = !!embeddingModelRow.dimension_configurable;
    if (!dimensionConfigurable) {
      return NextResponse.json(
        { error: "Selected embedding model does not support configurable dimensions" },
        { status: 400 },
      );
    }
    const allowed =
      Array.isArray(embeddingModelRow.allowed_dimensions) &&
      (embeddingModelRow.allowed_dimensions as number[]).length > 0
        ? (embeddingModelRow.allowed_dimensions as number[]).filter((n) => typeof n === "number")
        : DEFAULT_ALLOWED_DIMENSIONS;
    if (!allowed.includes(embeddingDimension)) {
      return NextResponse.json(
        { error: `Embedding dimension must be one of: ${allowed.join(", ")}` },
        { status: 400 },
      );
    }
  }

  const { data: existingConfig, error: loadErr } = await supabase
    .from("org_model_configs")
    .select("org_id, embedding_model, embedding_dimension, current_embedding_version, previous_embedding_version")
    .eq("org_id", orgId)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }

  const embeddingModelChanged =
    existingConfig !== null && existingConfig.embedding_model !== embeddingModel;

  const currentEmbeddingDimension =
    typeof existingConfig?.embedding_dimension === "number" ? existingConfig.embedding_dimension : null;
  const embeddingDimensionChanged =
    embeddingDimension !== undefined &&
    (embeddingDimension !== currentEmbeddingDimension ||
      (embeddingDimension === null && currentEmbeddingDimension !== null));

  const embeddingConfigChanged = embeddingModelChanged || embeddingDimensionChanged;

  // Version bump when the embedding model or dimension changes. Do not delete old chunks here —
  // reindex needs them as source; cleanup runs in reindex-complete after migration finishes.
  let versionFields: Record<string, unknown> = {};
  if (embeddingConfigChanged) {
    const currentVersion = (existingConfig?.current_embedding_version as number) ?? 1;

    versionFields = {
      previous_embedding_version: currentVersion,
      current_embedding_version: currentVersion + 1,
      reindex_status: "in_progress",
    };
  }

  const upsertPayload: Record<string, unknown> = {
    org_id: orgId,
    chat_provider: chatProvider,
    chat_model: chatModel,
    embedding_provider: embeddingProvider,
    embedding_model: embeddingModel,
    ...versionFields,
  };
  if (embeddingDimension !== undefined) {
    upsertPayload.embedding_dimension = embeddingDimension;
  }

  const { error: upsertErr } = await supabase
    .from("org_model_configs")
    .upsert(upsertPayload, { onConflict: "org_id" });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  const config = await getOrgModelConfig(orgId);

  let resEmbeddingDimensionConfigurable = false;
  let resEmbeddingDimensionDefault = 0;
  let resEmbeddingDimensionAllowed: number[] | undefined;

  const { data: embedRow } = await supabase
    .from("embedding_models")
    .select("dimension, dimension_configurable, allowed_dimensions")
    .eq("provider", config.embeddingProvider)
    .eq("name", config.embeddingModel)
    .eq("kind", "embedding")
    .maybeSingle();
  if (embedRow) {
    resEmbeddingDimensionConfigurable = !!embedRow.dimension_configurable;
    resEmbeddingDimensionDefault = (embedRow.dimension as number) ?? 0;
    if (Array.isArray(embedRow.allowed_dimensions) && embedRow.allowed_dimensions.length > 0) {
      resEmbeddingDimensionAllowed = (embedRow.allowed_dimensions as number[]).filter(
        (n) => typeof n === "number",
      );
    }
  }

  return NextResponse.json({
    config: {
      chatProvider: config.chatProvider,
      chatModel: config.chatModel,
      embeddingProvider: config.embeddingProvider,
      embeddingModel: config.embeddingModel,
      embeddingDimension: config.embeddingDimension,
      embeddingDimensionConfigurable: resEmbeddingDimensionConfigurable,
      embeddingDimensionDefault: resEmbeddingDimensionDefault,
      embeddingDimensionAllowed: resEmbeddingDimensionAllowed,
      currentEmbeddingVersion: config.currentEmbeddingVersion,
      previousEmbeddingVersion: config.previousEmbeddingVersion,
      reindexStatus: config.reindexStatus,
      isDefault: false,
    },
  });
}

