"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useCurrentOrganization } from "@/hooks/useCurrentOrganization";

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const { organizations, loading, currentOrganization } = useCurrentOrganization();

  useEffect(() => {
    if (loading) return;
    if (!organizations || organizations.length === 0) {
      router.push("/org/create");
    }
  }, [loading, organizations, router]);

  return (
    <div>
      <h1>{t("title")}</h1>
      {loading && !currentOrganization ? (
        <p>{t("loading")}</p>
      ) : currentOrganization ? (
        <p>{t("currentOrganization", { name: currentOrganization.name })}</p>
      ) : (
        <p>{t("selectOrCreateOrg")}</p>
      )}
      <p>{t("privateContent")}</p>
    </div>
  );
}

