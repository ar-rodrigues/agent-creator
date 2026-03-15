import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { indexDocumentTextForSpaces } from "@/lib/rag/chunking";
import { embedChunksForDocument } from "@/lib/rag/embeddings";

const BUCKET = "documents";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { error: "Form data required (file, orgId, knowledgeSpaceIds)" },
      { status: 400 },
    );
  }

  const file = formData.get("file") as File | null;
  const orgId = formData.get("orgId") as string | null;
  const knowledgeSpaceIdsRaw = formData.get("knowledgeSpaceIds");

  if (!file || !orgId?.trim()) {
    return NextResponse.json(
      { error: "file and orgId are required" },
      { status: 400 },
    );
  }

  const canUpload = await hasPermission(
    orgId.trim(),
    user.id,
    "DOCUMENT_UPLOAD",
  );
  if (!canUpload) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let knowledgeSpaceIds: string[] = [];
  if (knowledgeSpaceIdsRaw) {
    try {
      const parsed =
        typeof knowledgeSpaceIdsRaw === "string"
          ? JSON.parse(knowledgeSpaceIdsRaw)
          : knowledgeSpaceIdsRaw;
      knowledgeSpaceIds = Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      // ignore invalid JSON
    }
  }

  if (knowledgeSpaceIds.length === 0) {
    return NextResponse.json(
      { error: "At least one knowledge space is required" },
      { status: 400 },
    );
  }

  const tStart = Date.now();
  const crypto = await import("crypto");
  const fileId = crypto.randomUUID();
  const ext = file.name.replace(/^.*\./, "") || "bin";
  const storagePath = `org/${orgId.trim()}/spaces/${knowledgeSpaceIds[0]}/documents/${fileId}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message ?? "Upload failed" },
      { status: 500 },
    );
  }

  const { data: doc, error: insertErr } = await supabase
    .from("documents")
    .insert({
      org_id: orgId.trim(),
      storage_path: storagePath,
      filename: file.name,
      content_type: file.type || null,
      uploaded_by: user.id,
    })
    .select("id, filename, storage_path, created_at")
    .single();

  if (insertErr) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json(
      { error: insertErr.message ?? "Failed to create document record" },
      { status: 500 },
    );
  }

  if (knowledgeSpaceIds.length > 0) {
    const links = knowledgeSpaceIds.map((ksId) => ({
      document_id: doc.id,
      knowledge_space_id: ksId,
    }));
    const { error: linkErr } = await supabase
      .from("document_knowledge_spaces")
      .insert(links);

    if (linkErr) {
      // document already created; log but don't fail the request
      console.warn("document_knowledge_spaces insert error:", linkErr.message);
    }
  }

  const storageAndInsertMs = Date.now() - tStart;
  const t0 = Date.now();

  try {
    await indexDocumentTextForSpaces({
      orgId: orgId.trim(),
      documentId: doc.id,
      storagePath: doc.storage_path,
      contentType: file.type || null,
      knowledgeSpaceIds,
    });
    const chunkingMs = Date.now() - t0;
    const t1 = Date.now();
    await embedChunksForDocument({
      orgId: orgId.trim(),
      documentId: doc.id,
    });
    const embeddingMs = Date.now() - t1;
    const totalMs = Date.now() - tStart;
    console.log(
      `[upload] filename=${doc.filename} totalMs=${totalMs} storageAndInsertMs=${storageAndInsertMs} chunkingMs=${chunkingMs} embeddingMs=${embeddingMs}`,
    );
  } catch (err) {
    // Rollback: remove chunks, document record, and storage object
    await supabase
      .from("document_chunks")
      .delete()
      .eq("document_id", doc.id)
      .eq("org_id", orgId.trim());
    await supabase.from("documents").delete().eq("id", doc.id);
    await supabase.storage.from(BUCKET).remove([storagePath]);

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Document indexing failed. File was not saved.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      document: {
        id: doc.id,
        filename: doc.filename,
        storage_path: doc.storage_path,
        created_at: doc.created_at,
        knowledge_space_ids: knowledgeSpaceIds,
      },
    },
    { status: 201 },
  );
}
