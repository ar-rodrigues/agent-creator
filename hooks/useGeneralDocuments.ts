"use client";

import { useCallback, useEffect, useState } from "react";

export type GeneralDocument = {
  id: string;
  filename: string;
  created_at: string;
  content_type: string | null;
};

export type UseGeneralDocumentsReturn = {
  data: GeneralDocument[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useGeneralDocuments(
  orgId: string | null,
): UseGeneralDocumentsReturn {
  const [data, setData] = useState<GeneralDocument[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    if (!orgId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/documents?orgId=${encodeURIComponent(orgId)}`,
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Failed to load documents");
      }
      const payload = (await response.json()) as {
        documents: GeneralDocument[];
      };
      setData(payload.documents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  return {
    data,
    loading,
    error,
    refetch: fetchDocuments,
  };
}
