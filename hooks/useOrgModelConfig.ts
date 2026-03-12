"use client";

import { useCallback, useEffect, useState } from "react";

export type OrgModelConfig = {
  chatProvider: string;
  chatModel: string | null;
  embeddingProvider: string;
  embeddingModel: string;
  currentEmbeddingVersion: number;
  previousEmbeddingVersion: number | null;
};

export type UseOrgModelConfigReturn = {
  data: OrgModelConfig | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  update: (payload: {
    chatProvider: string;
    chatModel: string | null;
    embeddingProvider: string;
    embeddingModel: string;
  }) => Promise<void>;
};

export function useOrgModelConfig(orgId: string | null): UseOrgModelConfigReturn {
  const [data, setData] = useState<OrgModelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!orgId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${orgId}/model-config`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to load model configuration");
      }
      const payload = (await response.json()) as {
        config: OrgModelConfig & { isDefault?: boolean };
      };
      setData({
        chatProvider: payload.config.chatProvider,
        chatModel: payload.config.chatModel,
        embeddingProvider: payload.config.embeddingProvider,
        embeddingModel: payload.config.embeddingModel,
        currentEmbeddingVersion: payload.config.currentEmbeddingVersion,
        previousEmbeddingVersion: payload.config.previousEmbeddingVersion,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const update = useCallback(
    async (payload: {
      chatProvider: string;
      chatModel: string | null;
      embeddingProvider: string;
      embeddingModel: string;
    }) => {
      if (!orgId) return;
      setError(null);
      const response = await fetch(`/api/orgs/${orgId}/model-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to update model configuration");
      }
      const body = (await response.json()) as {
        config: OrgModelConfig & { isDefault?: boolean };
      };
      setData({
        chatProvider: body.config.chatProvider,
        chatModel: body.config.chatModel,
        embeddingProvider: body.config.embeddingProvider,
        embeddingModel: body.config.embeddingModel,
        currentEmbeddingVersion: body.config.currentEmbeddingVersion,
        previousEmbeddingVersion: body.config.previousEmbeddingVersion,
      });
    },
    [orgId],
  );

  return {
    data,
    loading,
    error,
    refetch: fetchConfig,
    update,
  };
}

