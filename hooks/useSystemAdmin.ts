"use client";

import { useCallback, useEffect, useState } from "react";

export type UseSystemAdminReturn = {
  isSystemAdmin: boolean;
  loading: boolean;
  error: string | null;
};

/**
 * Returns whether the current authenticated user is a system admin.
 * Fetches from /api/system/admin-check.
 */
export function useSystemAdmin(): UseSystemAdminReturn {
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/system/admin-check");
      if (!res.ok) {
        setIsSystemAdmin(false);
        return;
      }
      const payload = (await res.json()) as { isSystemAdmin: boolean };
      setIsSystemAdmin(payload.isSystemAdmin === true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsSystemAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return { isSystemAdmin, loading, error };
}
