"use client";

import { useCallback, useEffect, useState } from "react";

export type OrgProviderSecret = {
  provider: "openai" | "anthropic" | "google";
  hasKey: boolean;
  last4: string | null;
  updatedAt: string | null;
};

export type UseOrgProviderSecretsReturn = {
  data: OrgProviderSecret[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  update: (provider: OrgProviderSecret["provider"], apiKey: string) => Promise<void>;
};

export function useOrgProviderSecrets(
  orgId: string | null,
): UseOrgProviderSecretsReturn {
  const [data, setData] = useState<OrgProviderSecret[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSecrets = useCallback(async () => {
    if (!orgId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${orgId}/provider-secrets`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to load provider secrets");
      }
      const payload = (await response.json()) as {
        secrets: OrgProviderSecret[];
      };
      setData(payload.secrets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void fetchSecrets();
  }, [fetchSecrets]);

  const update = useCallback(
    async (provider: OrgProviderSecret["provider"], apiKey: string) => {
      if (!orgId) return;
      setError(null);
      const response = await fetch(`/api/orgs/${orgId}/provider-secrets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to update provider secret");
      }
      const payload = (await response.json()) as {
        secret: OrgProviderSecret;
      };
      setData((prev) => {
        if (!prev) return [payload.secret];
        const existingIndex = prev.findIndex((s) => s.provider === payload.secret.provider);
        if (existingIndex === -1) {
          return [...prev, payload.secret];
        }
        const next = [...prev];
        next[existingIndex] = payload.secret;
        return next;
      });
    },
    [orgId],
  );

  return {
    data,
    loading,
    error,
    refetch: fetchSecrets,
    update,
  };
}

