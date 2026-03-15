import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { getOrgModelConfig } from "@/lib/llm/orgConfig";

type Params = { params: Promise<{ orgId: string }> };

/**
 * POST /api/orgs/[orgId]/reindex-complete
 * Marks the soft migration as finished: deletes chunks at previous_embedding_version (cleanup),
 * then sets reindex_status = 'idle'. Called by ReindexProvider once all documents have been re-embedded.
 */
export async function POST(_request: Request, { params }: Params) {
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

  const orgConfig = await getOrgModelConfig(orgId);
  const previousVersion = orgConfig.previousEmbeddingVersion;

  if (previousVersion != null) {
    const { error: deleteErr } = await supabase
      .from("document_chunks")
      .delete()
      .eq("org_id", orgId)
      .eq("embedding_version", previousVersion);
    if (deleteErr) {
      console.warn("reindex-complete: failed to delete old chunks", deleteErr.message);
    }
  }

  const { error } = await supabase
    .from("org_model_configs")
    .update({ reindex_status: "idle" })
    .eq("org_id", orgId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
