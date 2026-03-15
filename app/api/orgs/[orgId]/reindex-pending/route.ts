import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { getOrgModelConfig } from "@/lib/llm/orgConfig";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/orgs/[orgId]/reindex-pending
 * Returns document IDs that have chunks at any version other than current_embedding_version.
 * This includes docs with chunks only at older versions (e.g. after failed reindexes), so
 * they get re-embedded to the current version. Used by ReindexProvider for the re-embed loop.
 */
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

  const orgConfig = await getOrgModelConfig(orgId);
  const currVersion = orgConfig.currentEmbeddingVersion;

  // Documents that already have chunks at current version (no need to re-embed).
  const { data: currChunks } = await supabase
    .from("document_chunks")
    .select("document_id")
    .eq("org_id", orgId)
    .eq("embedding_version", currVersion);
  const currDocIdSet = new Set((currChunks ?? []).map((r) => r.document_id as string));

  // Documents that have at least one chunk at any other version (need re-embed to current).
  const { data: staleChunks } = await supabase
    .from("document_chunks")
    .select("document_id")
    .eq("org_id", orgId)
    .neq("embedding_version", currVersion);
  const staleDocIds = [...new Set((staleChunks ?? []).map((r) => r.document_id as string))];
  const pending = staleDocIds.filter((id) => !currDocIdSet.has(id));

  return NextResponse.json({ documentIds: pending, total: pending.length });
}
