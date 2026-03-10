"use client";

import {useEffect, useMemo, useState} from "react";
import {useOrganizations} from "./useOrganizations";

const STORAGE_KEY = "current_org_id";

export function useCurrentOrganization() {
  const {data: organizations, loading, error, refetch} = useOrganizations();
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setCurrentOrgId(stored);
    }
  }, []);

  useEffect(() => {
    if (organizations === null) return;

    if (organizations.length === 0) {
      setCurrentOrgId(prev => {
        if (prev && typeof window !== "undefined") {
          window.localStorage.removeItem(STORAGE_KEY);
        }
        return null;
      });
      return;
    }

    setCurrentOrgId(prev => {
      const prevInList = prev && organizations.some(org => org.id === prev);
      if (prev && !prevInList) {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(STORAGE_KEY);
        }
        return null;
      }
      if (prevInList) return prev;
      if (organizations.length === 1) {
        const only = organizations[0]?.id ?? null;
        if (typeof window !== "undefined" && only) {
          window.localStorage.setItem(STORAGE_KEY, only);
        }
        return only;
      }
      return prev;
    });
  }, [organizations]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (currentOrgId) {
      window.localStorage.setItem(STORAGE_KEY, currentOrgId);
    }
  }, [currentOrgId]);

  const currentOrganization = useMemo(
    () => organizations?.find(org => org.id === currentOrgId) ?? null,
    [organizations, currentOrgId],
  );

  return {
    organizations,
    loading,
    error,
    currentOrgId,
    currentOrganization,
    setCurrentOrgId,
    refetch,
  };
}

