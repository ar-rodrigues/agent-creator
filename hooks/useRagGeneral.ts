"use client";

import { useCallback, useState } from "react";
import type { LlmProvider } from "@/lib/llm/types";

export type RagSource = {
  number: number;
  documentId: string;
  spaceId: string;
  chunkIndex: number;
  score: number | null;
  content: string;
};

export type RagGeneralAnswer = {
  answer: string;
  sources: RagSource[];
  meta: {
    provider: LlmProvider | null;
    model?: string;
    usedSpaces: string[];
  };
};

type AskParams = {
  orgId: string;
  question: string;
  knowledgeSpaceIds?: string[];
  provider?: LlmProvider;
};

export type UseRagGeneralReturn = {
  data: RagGeneralAnswer | null;
  loading: boolean;
  error: string | null;
  ask: (params: AskParams) => Promise<RagGeneralAnswer | null>;
};

export function useRagGeneral(): UseRagGeneralReturn {
  const [data, setData] = useState<RagGeneralAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async (params: AskParams): Promise<RagGeneralAnswer | null> => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch("/api/rag/general", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const payload = (await res.json().catch(() => null)) as
        | (RagGeneralAnswer & { error?: string })
        | { error: string }
        | null;

      if (!res.ok) {
        throw new Error(payload?.error ?? "RAG request failed");
      }

      if (!payload || "error" in payload) {
        throw new Error(payload?.error ?? "RAG request failed");
      }

      setData(payload);
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    data,
    loading,
    error,
    ask,
  };
}

