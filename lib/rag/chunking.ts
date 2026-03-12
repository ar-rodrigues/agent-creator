import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Chunk = {
  index: number;
  content: string;
};

export type ChunkDocumentInput = {
  content: string;
  mimeType?: string | null;
  maxChars?: number;
  overlap?: number;
};

export function chunkDocument(input: ChunkDocumentInput): Chunk[] {
  const { content, maxChars = 800, overlap = 200 } = input;
  if (!content.trim()) {
    return [];
  }

  const normalized = content.replace(/\r\n/g, "\n");
  const paragraphs = normalized.split(/\n{2,}/);

  const chunks: Chunk[] = [];
  let buffer = "";

  const flushBuffer = () => {
    if (!buffer.trim()) return;
    const text = buffer.trim();
    if (text.length <= maxChars) {
      chunks.push({ index: chunks.length, content: text });
      buffer = "";
      return;
    }

    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + maxChars, text.length);
      const slice = text.slice(start, end);
      chunks.push({ index: chunks.length, content: slice });
      if (end === text.length) break;
      start = end - overlap;
      if (start < 0) start = 0;
    }
    buffer = "";
  };

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    if ((buffer + "\n\n" + trimmed).length > maxChars) {
      flushBuffer();
      buffer = trimmed;
    } else {
      buffer = buffer ? `${buffer}\n\n${trimmed}` : trimmed;
    }
  }

  flushBuffer();

  return chunks;
}

type IndexDocumentArgs = {
  orgId: string;
  documentId: string;
  storagePath: string;
  contentType: string | null;
  knowledgeSpaceIds: string[];
};

export async function indexDocumentTextForSpaces(args: IndexDocumentArgs): Promise<void> {
  const { orgId, documentId, storagePath, contentType, knowledgeSpaceIds } = args;

  if (!knowledgeSpaceIds.length) {
    return;
  }

  const supabase = await createSupabaseServerClient();

  const { data: fileData, error: downloadError } = await supabase.storage
    .from("documents")
    .download(storagePath);

  if (downloadError || !fileData) {
    console.warn(
      "Failed to download document for chunking",
      downloadError?.message ?? "unknown error",
    );
    return;
  }

  const resolvedContentType = contentType || "application/octet-stream";
  if (!resolvedContentType.startsWith("text/") && resolvedContentType !== "application/json") {
    console.warn("Skipping chunking for non-text content type", resolvedContentType);
    return;
  }

  const text = await fileData.text();
  const chunks = chunkDocument({ content: text });

  if (!chunks.length) {
    return;
  }

  const rows = knowledgeSpaceIds.flatMap((knowledgeSpaceId) =>
    chunks.map((chunk) => ({
      org_id: orgId,
      document_id: documentId,
      knowledge_space_id: knowledgeSpaceId,
      chunk_index: chunk.index,
      content: chunk.content,
    })),
  );

  const { error: insertError } = await supabase.from("document_chunks").insert(rows);

  if (insertError) {
    console.warn("Failed to insert document chunks", insertError.message);
  }
}

