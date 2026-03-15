import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { getLlmClient } from "@/lib/llm/client";
import type { LlmProvider, LlmMessage } from "@/lib/llm/types";
import { retrieveRelevantChunks } from "@/lib/rag/retrieve";
import { getOrgModelConfig } from "@/lib/llm/orgConfig";
import { getGoogleApiKey } from "@/lib/llm/getGoogleApiKey";
import {
  estimateTokens,
  CONTEXT_WINDOW_MAX_TOKENS,
} from "@/lib/utils/tokens";

const RESERVED_OUTPUT_TOKENS = 4096;

type ConversationMessage = { role: "user" | "assistant"; content: string };

type GeneralRagRequest = {
  orgId?: string;
  question?: string;
  knowledgeSpaceIds?: string[];
  provider?: LlmProvider;
  messages?: ConversationMessage[];
};

function ndjsonLine(obj: object): string {
  return JSON.stringify(obj) + "\n";
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const body = (await request.json().catch(() => null)) as GeneralRagRequest | null;
  const orgId = body?.orgId?.trim();
  const question = body?.question?.trim();
  const knowledgeSpaceIds = body?.knowledgeSpaceIds ?? [];
  const requestedProvider = body?.provider;
  const conversationHistory = body?.messages ?? [];

  if (!orgId || !question) {
    return new Response(
      ndjsonLine({ type: "error", error: "orgId and question are required" }),
      { status: 400, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  const canRead = await hasPermission(orgId, user.id, "KNOWLEDGE_SPACE_READ");
  if (!canRead) {
    return new Response(ndjsonLine({ type: "error", error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  const { data: spaces, error: spacesError } = await supabase
    .from("knowledge_spaces")
    .select("id, name, scope")
    .eq("org_id", orgId)
    .eq("scope", "general");

  if (spacesError) {
    return new Response(
      ndjsonLine({
        type: "error",
        error: spacesError.message ?? "Failed to load knowledge spaces",
      }),
      { status: 500, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  if (!spaces || spaces.length === 0) {
    return new Response(
      ndjsonLine({
        type: "error",
        error: "No general knowledge spaces exist for this organization",
      }),
      { status: 400, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  const spaceIdsToUse =
    knowledgeSpaceIds.length > 0
      ? knowledgeSpaceIds.filter((id) => spaces.some((s) => s.id === id))
      : spaces.map((s) => s.id);

  if (spaceIdsToUse.length === 0) {
    return new Response(
      ndjsonLine({
        type: "error",
        error: "No valid general knowledge spaces selected",
      }),
      { status: 400, headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  const orgConfig = await getOrgModelConfig(orgId);

  const chunks = await retrieveRelevantChunks({
    orgId,
    knowledgeSpaceIds: spaceIdsToUse,
    query: question,
    limit: 12,
    embeddingVersion: orgConfig.currentEmbeddingVersion,
  });

  const sources = chunks.map((chunk, i) => ({
    number: i + 1,
    documentId: chunk.document_id,
    spaceId: chunk.knowledge_space_id,
    chunkIndex: chunk.chunk_index,
    score: typeof chunk.score === "number" ? chunk.score : null,
    content: chunk.content,
  }));

  const meta = {
    provider: (requestedProvider ?? orgConfig.chatProvider) as LlmProvider,
    model: orgConfig.chatApiModelId ?? orgConfig.chatModel ?? undefined,
    usedSpaces: spaceIdsToUse,
  };

  if (!chunks.length) {
    const noContentMessage = ndjsonLine({
      type: "chunk",
      text: "I could not find any indexed content in the selected general knowledge spaces yet.",
    }) + ndjsonLine({ type: "done", sources, meta });
    return new Response(noContentMessage, {
      status: 200,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  const context = chunks
    .map((chunk, i) => `[${i + 1}] ${chunk.content}`)
    .join("\n\n");

  const systemPrompt = [
    "You are an assistant that answers questions using the provided organization knowledge.",
    "Always answer in the same language as the user's question (e.g. if the question is in Spanish, respond in Spanish; if in English, respond in English).",
    "Use the context sections below to answer factually.",
    "If the answer is not contained in the context, say you do not know rather than inventing details.",
    "Each context section is numbered starting at 1.",
    "When you reference information from a source, insert the citation marker [N] (where N is the source number) immediately after the referenced information.",
    "Example: 'The component has 10 pins [1], and supports voltages up to 1000V [2].'",
  ].join(" ");

  const currentTurnContent = [
    "Context:",
    context,
    "",
    `Question: ${question}`,
    "",
    "Answer concisely and, when appropriate, mention which documents you used.",
  ].join("\n");

  const systemTokens = estimateTokens(systemPrompt);
  const currentTurnTokens = estimateTokens(currentTurnContent);
  const fixedTokens = systemTokens + currentTurnTokens + RESERVED_OUTPUT_TOKENS;
  const historyBudget = Math.max(0, CONTEXT_WINDOW_MAX_TOKENS - fixedTokens);

  const truncatedHistory: LlmMessage[] = [];
  let historyTokens = 0;
  for (let i = 0; i < conversationHistory.length; i++) {
    const msg = conversationHistory[i];
    const tokens = estimateTokens(msg.content);
    if (historyTokens + tokens > historyBudget) break;
    truncatedHistory.push({ role: msg.role, content: msg.content });
    historyTokens += tokens;
  }

  const messages: LlmMessage[] = [
    { role: "system", content: systemPrompt },
    ...truncatedHistory,
    { role: "user", content: currentTurnContent },
  ];

  const contextTokensUsed = systemTokens + historyTokens + currentTurnTokens;

  const effectiveProvider = (requestedProvider ?? orgConfig.chatProvider) as LlmProvider;
  const chatModel = orgConfig.chatApiModelId ?? orgConfig.chatModel ?? undefined;
  const orgKey =
    effectiveProvider === "gemini" ? await getGoogleApiKey(orgId) : null;
  const client = getLlmClient(effectiveProvider);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const text of client.chatStream({
          messages,
          model: chatModel,
          maxTokens: 4096,
          ...(effectiveProvider === "gemini" && orgKey
            ? { googleApiKey: orgKey }
            : {}),
        })) {
          controller.enqueue(encoder.encode(ndjsonLine({ type: "chunk", text })));
        }
        controller.enqueue(
          encoder.encode(
            ndjsonLine({
              type: "done",
              sources,
              meta: { ...meta, contextTokensUsed },
            }),
          ),
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to generate an answer from the language model";
        controller.enqueue(
          encoder.encode(ndjsonLine({ type: "error", error: message })),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
