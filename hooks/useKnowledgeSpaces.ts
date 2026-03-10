"use client";

import { useCallback, useEffect, useState } from "react";

export type KnowledgeSpace = {
  id: string;
  name: string;
  scope: string;
  project_id: string | null;
  created_at: string;
};

export type UseKnowledgeSpacesReturn = {
  data: KnowledgeSpace[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useKnowledgeSpaces(orgId: string | null): UseKnowledgeSpacesReturn {
  const [data, setData] = useState<KnowledgeSpace[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSpaces = useCallback(async () => {
    if (!orgId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/knowledge-spaces?orgId=${encodeURIComponent(orgId)}`,
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Failed to load knowledge spaces");
      }
      const payload = (await response.json()) as {
        knowledge_spaces: KnowledgeSpace[];
      };
      setData(payload.knowledge_spaces ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void fetchSpaces();
  }, [fetchSpaces]);

  return {
    data,
    loading,
    error,
    refetch: fetchSpaces,
  };
}
