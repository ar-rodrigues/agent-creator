"use client";

import {useCallback, useEffect, useState} from "react";

type Organization = {
  id: string;
  name: string;
  created_at: string;
};

type UseOrganizationsReturn = {
  data: Organization[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useOrganizations(): UseOrganizationsReturn {
  const [data, setData] = useState<Organization[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/orgs", {
        method: "GET",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | {error?: string}
          | null;
        throw new Error(payload?.error || "Failed to load organizations");
      }
      const payload = (await response.json()) as {organizations: Organization[]};
      setData(payload.organizations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOrgs();
  }, [fetchOrgs]);

  return {
    data,
    loading,
    error,
    refetch: fetchOrgs,
  };
}

