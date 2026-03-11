"use client";

import { useCallback, useEffect, useState } from "react";

export type OrgMember = {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  seat_type_key: string | null;
  seat_type_name: string | null;
  created_at: string;
};

export type UseOrgMembersReturn = {
  data: OrgMember[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useOrgMembers(orgId: string | null): UseOrgMembersReturn {
  const [data, setData] = useState<OrgMember[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!orgId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${orgId}/members`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to load members");
      }
      const payload = (await response.json()) as { members: OrgMember[] };
      setData(payload.members ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  return {
    data: data ?? null,
    loading,
    error,
    refetch: fetchMembers,
  };
}
