import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { getLlmClient } from "@/lib/llm/client";
import { getOrgModelConfig } from "@/lib/llm/orgConfig";
import { getGoogleApiKey } from "@/lib/llm/getGoogleApiKey";
import type { LlmProvider } from "@/lib/llm/types";

type RouteParams = { params: Promise<{ spaceId: string }> };

const LANGUAGE_NAMES: Record<string, string> = {
  es: "Spanish",
  en: "English",
};

function mapSummaryError(err: unknown): { status: number; message: string; reason: string } {
  const message = err instanceof Error ? err.message : "Failed to generate summary";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("429")
  ) {
    return {
      status: 429,
      message: "Summary generation is rate-limited. Please retry in a moment.",
      reason: "rate_limit",
    };
  }

  if (
    normalized.includes("busy") ||
    normalized.includes("overload") ||
    normalized.includes("unavailable")
  ) {
    return {
      status: 503,
      message: "Summary provider is busy. Please retry shortly.",
      reason: "provider_busy",
    };
  }

  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return {
      status: 504,
      message: "Summary generation timed out. Please retry.",
      reason: "timeout",
    };
  }

  if (normalized.includes("api key") || normalized.includes("not configured")) {
    return {
      status: 400,
      message,
      reason: "configuration",
    };
  }

  return {
    status: 500,
    message,
    reason: "unknown",
  };
}

export async function POST(request: Request, { params }: RouteParams) {
  const routeStart = Date.now();
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
    const titleStart = Date.now();
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
    // Capture full title (model may break across lines); $ in /m matches EOL so we use [\s\S]+ then normalize
    const titleMatch = /^Title:\s*([\s\S]+)/m.exec(titleRaw);
    const title = titleMatch?.[1]
      ? titleMatch[1].trim().replace(/\s+/g, " ").trim()
      : null;
    const titleMs = Date.now() - titleStart;

    // Step 2: Generate summary only (dedicated call so the model completes the paragraph).
    // Cap context to avoid input token limits that can cause the model to truncate output.
    const SUMMARY_CONTEXT_MAX_CHARS = 6000;
    const summaryContext = contextSnippet.slice(0, SUMMARY_CONTEXT_MAX_CHARS);
    const summaryStart = Date.now();
    const summaryResponse = await client.chat({
      messages: [
        {
          role: "system",
          content:
            "You write only a summary paragraph. Output exactly one line starting with 'Summary: ' followed by 3 to 5 complete sentences. The paragraph must end with a period. Do not stop mid-sentence. Your summary must be at least 150 characters.",
        },
        {
          role: "user",
          content: [
            `In ${languageName}, write a 3–5 sentence paragraph summarizing the main topics and value of this document collection. Your reply must be exactly: Summary: <your paragraph>`,
            "",
            "Excerpts:",
            summaryContext,
          ].join("\n"),
        },
      ],
      ...chatOpts,
      maxTokens: 2048,
    });
    const summaryRaw = summaryResponse.messages[summaryResponse.messages.length - 1]?.content ?? "";
    const summaryMatch = /^Summary:\s*([\s\S]+)/m.exec(summaryRaw);
    const summary = summaryMatch?.[1]?.trim() ?? null;
    const summaryMs = Date.now() - summaryStart;

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

    const totalMs = Date.now() - routeStart;
    console.log(
      `[summary] spaceId=${spaceId} locale=${locale} provider=${effectiveProvider} totalMs=${totalMs} titleMs=${titleMs} summaryMs=${summaryMs} excerptCount=${chunks.length}`,
    );

    return NextResponse.json({ title, summary });
  } catch (err) {
    const mapped = mapSummaryError(err);
    console.warn(
      `[summary] failed spaceId=${spaceId} locale=${locale} provider=${effectiveProvider} reason=${mapped.reason} message=${mapped.message}`,
    );
    return NextResponse.json(
      {
        error: mapped.message,
      },
      { status: mapped.status },
    );
  }
}
