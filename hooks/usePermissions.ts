"use client";

import { useCallback, useEffect, useState } from "react";

export type UsePermissionsReturn = {
  permissions: string[];
  loading: boolean;
  error: string | null;
  can: (key: string) => boolean;
  refetch: () => Promise<void>;
};

export function usePermissions(orgId: string | null): UsePermissionsReturn {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    if (!orgId) {
      setPermissions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/permissions?orgId=${encodeURIComponent(orgId)}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to load permissions");
      }
      const payload = (await response.json()) as { permissions: string[] };
      setPermissions(payload.permissions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void fetchPermissions();
  }, [fetchPermissions]);

  const can = useCallback(
    (key: string) => permissions.includes(key),
    [permissions],
  );

  return {
    permissions,
    loading,
    error,
    can,
    refetch: fetchPermissions,
  };
}
