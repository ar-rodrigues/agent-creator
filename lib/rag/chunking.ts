import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgModelConfig } from "@/lib/llm/orgConfig";
import { extractText, getDocumentProxy } from "unpdf";

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

/**
 * Sanitizes text so it can be safely sent as JSON (e.g. in Supabase insert).
 * Replaces invalid \u escape sequences (e.g. \u0, \u00) that would cause
 * "unsupported Unicode escape sequence" when the payload is parsed.
 */
function sanitizeForJsonPayload(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{0,3})(?![0-9a-fA-F])/g, " ");
}

/** Removes null (U+0000) and other control chars that PostgreSQL text type rejects. */
function stripNullsAndControlChars(text: string): string {
  return text.replace(/\0/g, " ").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ");
}

export function chunkDocument(input: ChunkDocumentInput): Chunk[] {
  const { content, maxChars = 800, overlap = 200 } = input;
  if (!content.trim()) {
    return [];
  }

  const normalized = stripNullsAndControlChars(sanitizeForJsonPayload(content)).replace(/\r\n/g, "\n");
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

  const orgConfig = await getOrgModelConfig(orgId);
  const currentEmbeddingVersion = orgConfig.currentEmbeddingVersion;

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

  let text: string;
  if (resolvedContentType === "application/pdf") {
    try {
      const buffer = await fileData.arrayBuffer();
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const result = await extractText(pdf, { mergePages: true });
      text = result.text ?? "";
    } catch (err) {
      console.warn(
        "PDF text extraction failed",
        err instanceof Error ? err.message : String(err),
      );
      return;
    }
  } else if (
    resolvedContentType.startsWith("text/") ||
    resolvedContentType === "application/json"
  ) {
    text = await fileData.text();
  } else {
    console.warn("Skipping chunking for unsupported content type", resolvedContentType);
    return;
  }

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
      embedding_version: currentEmbeddingVersion,
    })),
  );

  const { error: insertError } = await supabase.from("document_chunks").insert(rows);

  if (insertError) {
    console.warn("Failed to insert document chunks", insertError.message);
  }
}

