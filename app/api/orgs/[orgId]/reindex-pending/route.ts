import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { getOrgModelConfig } from "@/lib/llm/orgConfig";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/orgs/[orgId]/reindex-pending
 * Returns the list of document IDs that have chunks at previous_embedding_version
 * but not yet at current_embedding_version. Used by the ReindexProvider to resume
 * or start the background re-embedding loop.
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

  if (orgConfig.previousEmbeddingVersion === null) {
    return NextResponse.json({ documentIds: [], total: 0 });
  }

  const prevVersion = orgConfig.previousEmbeddingVersion;
  const currVersion = orgConfig.currentEmbeddingVersion;

  const [prevResult, currResult] = await Promise.all([
    supabase
      .from("document_chunks")
      .select("document_id")
      .eq("org_id", orgId)
      .eq("embedding_version", prevVersion),
    supabase
      .from("document_chunks")
      .select("document_id")
      .eq("org_id", orgId)
      .eq("embedding_version", currVersion),
  ]);

  const prevDocIds = [...new Set((prevResult.data ?? []).map((r) => r.document_id as string))];
  const currDocIdSet = new Set((currResult.data ?? []).map((r) => r.document_id as string));

  const pending = prevDocIds.filter((id) => !currDocIdSet.has(id));

  // #region agent log
  fetch("http://127.0.0.1:7607/ingest/e112d8ee-afe5-4f41-b25a-54d819e96ee7", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "028a22" },
    body: JSON.stringify({
      sessionId: "028a22",
      location: "reindex-pending/route.ts",
      message: "reindex-pending result",
      data: { orgId, total: pending.length, prevDocCount: prevDocIds.length },
      timestamp: Date.now(),
      hypothesisId: "B",
    }),
  }).catch(() => {});
  // #endregion

  return NextResponse.json({ documentIds: pending, total: pending.length });
}
