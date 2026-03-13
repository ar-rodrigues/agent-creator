import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { getLlmClient } from "@/lib/llm/client";
import { getOrgModelConfig } from "@/lib/llm/orgConfig";
import type { LlmMessage, LlmProvider } from "@/lib/llm/types";

type RouteParams = { params: Promise<{ spaceId: string }> };

const LANGUAGE_NAMES: Record<string, string> = {
  es: "Spanish",
  en: "English",
};

export async function POST(request: Request, { params }: RouteParams) {
  const { spaceId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { locale?: string };
  const locale = typeof body.locale === "string" ? body.locale : "en";
  const languageName = LANGUAGE_NAMES[locale] ?? "English";

  const { data: space, error: spaceError } = await supabase
    .from("knowledge_spaces")
    .select("id, org_id, name")
    .eq("id", spaceId)
    .single();

  if (spaceError || !space) {
    return NextResponse.json({ error: "Knowledge space not found" }, { status: 404 });
  }

  const canRead = await hasPermission(space.org_id, user.id, "KNOWLEDGE_SPACE_READ");
  if (!canRead) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: chunks, error: chunksError } = await supabase
    .from("document_chunks")
    .select("content")
    .eq("org_id", space.org_id)
    .eq("knowledge_space_id", spaceId)
    .order("chunk_index", { ascending: true })
    .limit(6);

  if (chunksError) {
    return NextResponse.json({ error: chunksError.message }, { status: 500 });
  }

  if (!chunks || chunks.length === 0) {
    await supabase
      .from("knowledge_spaces")
      .update({ summary_title: null, summary: null })
      .eq("id", spaceId);
    return NextResponse.json({ title: null, summary: null });
  }

  // Keep excerpts short so the full prompt fits within small local model contexts.
  const contextSnippet = chunks
    .map((c, i) => `[${i + 1}] ${c.content.slice(0, 300)}`)
    .join("\n\n");

  const orgConfig = await getOrgModelConfig(space.org_id);
  const client = getLlmClient((orgConfig.chatProvider as LlmProvider) ?? undefined);

  const messages: LlmMessage[] = [
    {
      role: "system",
      content:
        "You are a helpful assistant that summarizes document collections concisely.",
    },
    {
      role: "user",
      content: [
        "Below are excerpts from documents in a knowledge space.",
        `Generate a concise title (5–8 words) and a 2–3 sentence summary of the overall content. Respond in ${languageName}.`,
        "Respond in this exact format:",
        "Title: <title here>",
        "Summary: <summary here>",
        "",
        "Excerpts:",
        contextSnippet,
      ].join("\n"),
    },
  ];

  try {
    const response = await client.chat({
      messages,
      model: orgConfig.chatModel ?? undefined,
    });
    const raw = response.messages[response.messages.length - 1]?.content ?? "";

    const titleMatch = /^Title:\s*(.+)$/m.exec(raw);
    const summaryMatch = /^Summary:\s*([\s\S]+)$/m.exec(raw);

    const title = titleMatch?.[1]?.trim() ?? null;
    const summary = summaryMatch?.[1]?.trim() ?? null;

    await supabase
      .from("knowledge_spaces")
      .update({ summary_title: title, summary })
      .eq("id", spaceId);

    return NextResponse.json({ title, summary });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to generate summary",
      },
      { status: 500 },
    );
  }
}
