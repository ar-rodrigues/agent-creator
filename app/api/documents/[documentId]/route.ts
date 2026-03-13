import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";

const BUCKET = "documents";

/**
 * DELETE /api/documents/[documentId]
 * Deletes a document: chunks, links, document row, and storage object.
 * Requires DOCUMENT_UPLOAD (same as upload – admin only).
 */
export async function DELETE(
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
    return NextResponse.json(
      { error: "documentId is required" },
      { status: 400 },
    );
  }

  const { data: doc, error: fetchErr } = await supabase
    .from("documents")
    .select("id, org_id, storage_path")
    .eq("id", documentId.trim())
    .single();

  if (fetchErr || !doc) {
    return NextResponse.json(
      { error: "Document not found" },
      { status: 404 },
    );
  }

  const canDelete = await hasPermission(doc.org_id, user.id, "DOCUMENT_UPLOAD");
  if (!canDelete) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 1) Delete document_chunks for this document
  const { error: chunksErr } = await supabase
    .from("document_chunks")
    .delete()
    .eq("document_id", doc.id);

  if (chunksErr) {
    return NextResponse.json(
      { error: chunksErr.message ?? "Failed to delete document chunks" },
      { status: 500 },
    );
  }

  // 2) Delete document_knowledge_spaces links
  const { error: linksErr } = await supabase
    .from("document_knowledge_spaces")
    .delete()
    .eq("document_id", doc.id);

  if (linksErr) {
    return NextResponse.json(
      { error: linksErr.message ?? "Failed to unlink document from spaces" },
      { status: 500 },
    );
  }

  // 3) Delete document row
  const { error: docErr } = await supabase
    .from("documents")
    .delete()
    .eq("id", doc.id);

  if (docErr) {
    return NextResponse.json(
      { error: docErr.message ?? "Failed to delete document record" },
      { status: 500 },
    );
  }

  // 4) Remove from storage (best-effort; DB is already clean)
  await supabase.storage.from(BUCKET).remove([doc.storage_path]);

  return NextResponse.json({ ok: true });
}
