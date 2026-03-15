"use client";

import { useCallback, useEffect, useState } from "react";

export type OrgModelConfig = {
  chatProvider: string;
  chatModel: string | null;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimension: number | null;
  embeddingDimensionConfigurable: boolean;
  embeddingDimensionDefault: number;
  embeddingDimensionAllowed?: number[];
  currentEmbeddingVersion: number;
  previousEmbeddingVersion: number | null;
  reindexStatus: "idle" | "in_progress" | "error";
};

export type OrgModelConfigUpdatePayload = {
  chatProvider: string;
  chatModel: string | null;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimension?: number | null;
};

export type UseOrgModelConfigReturn = {
  data: OrgModelConfig | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  update: (payload: OrgModelConfigUpdatePayload) => Promise<OrgModelConfig | null>;
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
        config: OrgModelConfig & {
          isDefault?: boolean;
          embeddingDimension?: number | null;
          embeddingDimensionConfigurable?: boolean;
          embeddingDimensionDefault?: number;
          embeddingDimensionAllowed?: number[];
        };
      };
      const c = payload.config;
      setData({
        chatProvider: c.chatProvider,
        chatModel: c.chatModel,
        embeddingProvider: c.embeddingProvider,
        embeddingModel: c.embeddingModel,
        embeddingDimension: c.embeddingDimension ?? null,
        embeddingDimensionConfigurable: c.embeddingDimensionConfigurable ?? false,
        embeddingDimensionDefault: c.embeddingDimensionDefault ?? 0,
        embeddingDimensionAllowed: c.embeddingDimensionAllowed,
        currentEmbeddingVersion: c.currentEmbeddingVersion,
        previousEmbeddingVersion: c.previousEmbeddingVersion,
        reindexStatus: c.reindexStatus ?? "idle",
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
    async (payload: OrgModelConfigUpdatePayload): Promise<OrgModelConfig | null> => {
      if (!orgId) return null;
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
        config: OrgModelConfig & {
          isDefault?: boolean;
          embeddingDimension?: number | null;
          embeddingDimensionConfigurable?: boolean;
          embeddingDimensionDefault?: number;
          embeddingDimensionAllowed?: number[];
        };
      };
      const c = body.config;
      const config: OrgModelConfig = {
        chatProvider: c.chatProvider,
        chatModel: c.chatModel,
        embeddingProvider: c.embeddingProvider,
        embeddingModel: c.embeddingModel,
        embeddingDimension: c.embeddingDimension ?? null,
        embeddingDimensionConfigurable: c.embeddingDimensionConfigurable ?? false,
        embeddingDimensionDefault: c.embeddingDimensionDefault ?? 0,
        embeddingDimensionAllowed: c.embeddingDimensionAllowed,
        currentEmbeddingVersion: c.currentEmbeddingVersion,
        previousEmbeddingVersion: c.previousEmbeddingVersion,
        reindexStatus: c.reindexStatus ?? "idle",
      };
      setData(config);
      return config;
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

