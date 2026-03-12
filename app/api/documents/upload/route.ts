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

  const canUpload = await hasPermission(orgId.trim(), user.id, "DOCUMENT_UPLOAD");
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

  const crypto = await import("crypto");
  const fileId = crypto.randomUUID();
  const ext = file.name.replace(/^.*\./, "") || "bin";
  const storagePath = `org/${orgId.trim()}/documents/${fileId}.${ext}`;

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

  void indexDocumentTextForSpaces({
    orgId: orgId.trim(),
    documentId: doc.id,
    storagePath: doc.storage_path,
    contentType: file.type || null,
    knowledgeSpaceIds,
  })
    .then(() =>
      embedChunksForDocument({
        orgId: orgId.trim(),
        documentId: doc.id,
        // Embedding version will be resolved by the Edge Function when omitted.
      }),
    )
    .catch((err) => {
      console.warn(
        "Document indexing pipeline failed",
        err instanceof Error ? err.message : err,
      );
    });

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
