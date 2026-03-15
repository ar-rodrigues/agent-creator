"use client";

import { useCallback, useEffect, useState } from "react";
import type { ModuleKey } from "@/lib/modules/constants";

export type OrgModuleStateClient = {
  moduleKey: string;
  enabled: boolean;
  source: "manual" | "billing" | "default";
  updatedBy: string | null;
  updatedReason: string | null;
  updatedAt: string;
};

export type UseOrgModulesReturn = {
  data: Record<string, OrgModuleStateClient> | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isEnabled: (key: ModuleKey) => boolean;
};

export function useOrgModules(orgId: string | null): UseOrgModulesReturn {
  const [data, setData] = useState<Record<string, OrgModuleStateClient> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModules = useCallback(async () => {
    if (!orgId) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/modules`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to load module states");
      }
      const payload = (await response.json()) as { modules: Record<string, OrgModuleStateClient> };
      setData(payload.modules ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void fetchModules();
  }, [fetchModules]);

  const isEnabled = useCallback(
    (key: ModuleKey): boolean => data?.[key]?.enabled === true,
    [data],
  );

  return { data, loading, error, refetch: fetchModules, isEnabled };
}
