"use client";

import {useRouter} from "next/navigation";
import {useEffect} from "react";
import {useCurrentOrganization} from "@/hooks/useCurrentOrganization";

export default function DashboardPage() {
  const router = useRouter();
  const {organizations, loading, currentOrganization} = useCurrentOrganization();

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!organizations || organizations.length === 0) {
      router.push("/org/create");
    }
  }, [loading, organizations, router]);

  return (
    <div>
      <h1>Dashboard</h1>
      {loading && !currentOrganization ? (
        <p>Loading…</p>
      ) : currentOrganization ? (
        <p>Current organization: {currentOrganization.name}</p>
      ) : (
        <p>Select or create an organization to get started.</p>
      )}
      <p>Private dashboard content. Add more modules under (private) as needed.</p>
    </div>
  );
}

