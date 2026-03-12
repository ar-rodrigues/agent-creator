"use client";

import { useCallback, useState } from "react";
import type { LlmProvider } from "@/lib/llm/types";

export type RagGeneralAnswer = {
  answer: string;
  sources: {
    documentId: string;
    spaceId: string;
    chunkIndex: number;
    score: number | null;
  }[];
  meta: {
    provider: LlmProvider | null;
    model?: string;
    usedSpaces: string[];
  };
};

export type UseRagGeneralReturn = {
  data: RagGeneralAnswer | null;
  loading: boolean;
  error: string | null;
  ask: (params: {
    orgId: string;
    question: string;
    knowledgeSpaceIds?: string[];
    provider?: LlmProvider;
  }) => Promise<void>;
};

export function useRagGeneral(): UseRagGeneralReturn {
  const [data, setData] = useState<RagGeneralAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback<UseRagGeneralReturn["ask"]>(async (params) => {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
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

