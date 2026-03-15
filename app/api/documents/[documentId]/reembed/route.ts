import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { embedChunksForDocument, reindexChunksForDocument } from "@/lib/rag/embeddings";
import { getOrgModelConfig } from "@/lib/llm/orgConfig";

/**
 * POST /api/documents/[documentId]/reembed
 * Re-embeds all chunks of a document.
 *
 * When a soft migration is in progress (reindex_status = 'in_progress'), it runs in
 * migration mode: reads chunks at previous_embedding_version and INSERTs new rows at
 * current_embedding_version, preserving the old version for rollback.
 *
 * Outside of migration it updates existing chunk rows in-place (normal re-embed).
 *
 * Requires DOCUMENT_UPLOAD permission.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await params;
  if (!documentId?.trim()) {
    return NextResponse.json({ error: "documentId is required" }, { status: 400 });
  }

  const { data: doc, error: fetchErr } = await supabase
    .from("documents")
    .select("id, org_id")
    .eq("id", documentId.trim())
    .single();

  if (fetchErr || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const canEmbed = await hasPermission(doc.org_id, user.id, "DOCUMENT_UPLOAD");
  if (!canEmbed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const orgConfig = await getOrgModelConfig(doc.org_id);
    const isMigration =
      orgConfig.reindexStatus === "in_progress" &&
      orgConfig.previousEmbeddingVersion !== null;

    // #region agent log
    fetch("http://127.0.0.1:7607/ingest/e112d8ee-afe5-4f41-b25a-54d819e96ee7", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "028a22" },
      body: JSON.stringify({
        sessionId: "028a22",
        location: "reembed/route.ts",
        message: "reembed called",
        data: { documentId: doc.id, orgId: doc.org_id, isMigration },
        timestamp: Date.now(),
        hypothesisId: "C",
      }),
    }).catch(() => {});
    // #endregion

    if (isMigration) {
      await reindexChunksForDocument({
        orgId: doc.org_id,
        documentId: doc.id,
        fromVersion: orgConfig.previousEmbeddingVersion!,
        toVersion: orgConfig.currentEmbeddingVersion,
      });
    } else {
      await embedChunksForDocument({ orgId: doc.org_id, documentId: doc.id });
    }

    // #region agent log
    fetch("http://127.0.0.1:7607/ingest/e112d8ee-afe5-4f41-b25a-54d819e96ee7", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "028a22" },
      body: JSON.stringify({
        sessionId: "028a22",
        location: "reembed/route.ts",
        message: "reembed completed",
        data: { documentId: doc.id },
        timestamp: Date.now(),
        hypothesisId: "C",
      }),
    }).catch(() => {});
    // #endregion

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Embedding failed" },
      { status: 500 },
    );
  }
}
