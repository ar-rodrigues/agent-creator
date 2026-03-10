"use client";

import { useCallback, useEffect, useState } from "react";

export type OrgSettings = {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type UseOrgSettingsReturn = {
  data: OrgSettings | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  update: (payload: { name: string }) => Promise<void>;
};

export function useOrgSettings(orgId: string | null): UseOrgSettingsReturn {
  const [data, setData] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!orgId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${orgId}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to load organization");
      }
      const payload = (await response.json()) as { organization: OrgSettings };
      setData(payload.organization);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const update = useCallback(
    async (payload: { name: string }) => {
      if (!orgId) return;
      setError(null);
      const response = await fetch(`/api/orgs/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to update");
      }
      const body = (await response.json()) as { organization: OrgSettings };
      setData(body.organization);
    },
    [orgId],
  );

  return {
    data,
    loading,
    error,
    refetch: fetchSettings,
    update,
  };
}
