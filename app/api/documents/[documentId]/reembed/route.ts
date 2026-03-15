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

    if (isMigration) {
      const toVersion = orgConfig.currentEmbeddingVersion;
      // Use the document's actual chunk version as source (may be older than previous_embedding_version
      // if earlier reindexes failed, e.g. dimension mismatch).
      const { data: docChunks } = await supabase
        .from("document_chunks")
        .select("embedding_version")
        .eq("org_id", doc.org_id)
        .eq("document_id", doc.id)
        .lt("embedding_version", toVersion)
        .order("embedding_version", { ascending: false })
        .limit(1);
      const fromVersion = docChunks?.[0]?.embedding_version as number | undefined;
      if (fromVersion == null) {
        // Document has no chunks below current version (e.g. already at current), nothing to re-embed.
      } else {
        await reindexChunksForDocument({
          orgId: doc.org_id,
          documentId: doc.id,
          fromVersion,
          toVersion,
        });
      }
    } else {
      await embedChunksForDocument({ orgId: doc.org_id, documentId: doc.id });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Embedding failed" },
      { status: 500 },
    );
  }
}
