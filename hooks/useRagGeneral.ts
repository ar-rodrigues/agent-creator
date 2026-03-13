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

export type RagStreamCallbacks = {
  onChunk: (text: string) => void;
  onDone: (payload: { sources: RagSource[]; meta: RagGeneralAnswer["meta"] }) => void;
  onError: (error: string) => void;
  signal?: AbortSignal;
};

export type UseRagGeneralReturn = {
  data: RagGeneralAnswer | null;
  loading: boolean;
  error: string | null;
  ask: (params: AskParams) => Promise<RagGeneralAnswer | null>;
  askStreaming: (
    params: AskParams,
    callbacks: RagStreamCallbacks,
  ) => Promise<void>;
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

  const askStreaming = useCallback(
    async (
      params: AskParams,
      { onChunk, onDone, onError, signal }: RagStreamCallbacks,
    ): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/rag/general/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
          signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          onError(text || "Stream request failed");
          return;
        }
        const reader = res.body?.getReader();
        if (!reader) {
          onError("No response body");
          return;
        }
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const parsed = JSON.parse(trimmed) as {
                  type?: string;
                  text?: string;
                  error?: string;
                  sources?: RagSource[];
                  meta?: RagGeneralAnswer["meta"];
                };
                if (parsed.type === "chunk" && typeof parsed.text === "string") {
                  onChunk(parsed.text);
                } else if (parsed.type === "done" && parsed.sources && parsed.meta) {
                  onDone({ sources: parsed.sources, meta: parsed.meta });
                } else if (parsed.type === "error" && parsed.error) {
                  onError(parsed.error);
                }
              } catch {
                // skip malformed lines
              }
            }
          }
          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer.trim()) as {
                type?: string;
                text?: string;
                error?: string;
                sources?: RagSource[];
                meta?: RagGeneralAnswer["meta"];
              };
              if (parsed.type === "chunk" && typeof parsed.text === "string") {
                onChunk(parsed.text);
              } else if (parsed.type === "done" && parsed.sources && parsed.meta) {
                onDone({ sources: parsed.sources, meta: parsed.meta });
              } else if (parsed.type === "error" && parsed.error) {
                onError(parsed.error);
              }
            } catch {
              // skip
            }
          }
        } finally {
          reader.releaseLock();
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          onError("Cancelled");
          setError(null);
        } else {
          const msg = err instanceof Error ? err.message : "Unknown error";
          setError(msg);
          onError(msg);
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return {
    data,
    loading,
    error,
    ask,
    askStreaming,
  };
}

