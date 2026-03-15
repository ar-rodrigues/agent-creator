import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { getLlmClient } from "@/lib/llm/client";
import { getOrgModelConfig } from "@/lib/llm/orgConfig";
import { getGoogleApiKey } from "@/lib/llm/getGoogleApiKey";
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

  const SUMMARY_CHUNK_LIMIT = 15;
  const SUMMARY_EXCERPT_CHARS = 500;

  const { data: chunks, error: chunksError } = await supabase
    .from("document_chunks")
    .select("content")
    .eq("org_id", space.org_id)
    .eq("knowledge_space_id", spaceId)
    .order("chunk_index", { ascending: true })
    .limit(SUMMARY_CHUNK_LIMIT);

  if (chunksError) {
    return NextResponse.json({ error: chunksError.message }, { status: 500 });
  }

  if (!chunks || chunks.length === 0) {
    await supabase
      .from("knowledge_spaces")
      .update({ summary_i18n: null })
      .eq("id", spaceId);
    return NextResponse.json({ title: null, summary: null });
  }

  // Use enough excerpts so the summary reflects the full collection; keep each excerpt bounded for context limits.
  const contextSnippet = chunks
    .map((c, i) => `[${i + 1}] ${c.content.slice(0, SUMMARY_EXCERPT_CHARS)}`)
    .join("\n\n");

  const orgConfig = await getOrgModelConfig(space.org_id);
  const effectiveProvider = orgConfig.chatProvider as LlmProvider;
  const orgKey =
    effectiveProvider === "gemini" ? await getGoogleApiKey(space.org_id) : null;
  const client = getLlmClient(effectiveProvider);

  const chatOpts = {
    model: orgConfig.chatModel ?? undefined,
    ...(effectiveProvider === "gemini" && orgKey ? { googleApiKey: orgKey } : {}),
  };

  try {
    // Step 1: Generate title only (short response; model completes reliably).
    const titleResponse = await client.chat({
      messages: [
        {
          role: "system",
          content: "You output only a single line: Title: <5-8 word title>. Nothing else.",
        },
        {
          role: "user",
          content: [
            `In ${languageName}, give a concise title (5–8 words) for this document collection. Reply with exactly one line: Title: <title>`,
            "",
            "Excerpts:",
            contextSnippet.slice(0, 2000),
          ].join("\n"),
        },
      ],
      ...chatOpts,
      maxTokens: 128,
    });
    const titleRaw = titleResponse.messages[titleResponse.messages.length - 1]?.content ?? "";
    const titleMatch = /^Title:\s*(.+)$/m.exec(titleRaw);
    const title = titleMatch?.[1]?.trim() ?? null;

    // Step 2: Generate summary only (dedicated call so the model completes the paragraph).
    const summaryResponse = await client.chat({
      messages: [
        {
          role: "system",
          content:
            "You write only a summary paragraph. Output exactly one line starting with 'Summary: ' followed by 3 to 5 complete sentences. The paragraph must end with a period. Do not stop mid-sentence.",
        },
        {
          role: "user",
          content: [
            `In ${languageName}, write a 3–5 sentence paragraph summarizing the main topics and value of this document collection. Your reply must be exactly: Summary: <your paragraph>`,
            "",
            "Excerpts:",
            contextSnippet,
          ].join("\n"),
        },
      ],
      ...chatOpts,
      maxTokens: 1024,
    });
    const summaryRaw = summaryResponse.messages[summaryResponse.messages.length - 1]?.content ?? "";
    const summaryMatch = /^Summary:\s*([\s\S]+)/m.exec(summaryRaw);
    const summary = summaryMatch?.[1]?.trim() ?? null;

    if (summary != null && summary.length < 80) {
      console.warn(
        "[summary] very short summary — rawLength:",
        summaryRaw.length,
        "summaryLength:",
        summary.length,
        "fullSummary:",
        JSON.stringify(summary),
      );
    }

    const { data: current } = await supabase
      .from("knowledge_spaces")
      .select("summary_i18n")
      .eq("id", spaceId)
      .single();

    const i18n = (current?.summary_i18n as Record<string, { title: string; summary: string }> | null) ?? {};
    const next = { ...i18n, [locale]: { title: title ?? "", summary: summary ?? "" } };
    await supabase
      .from("knowledge_spaces")
      .update({ summary_i18n: next })
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
