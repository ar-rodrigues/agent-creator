"use client";

import { useMemo, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { App, Select } from "antd";
import { Link } from "@/i18n/navigation";
import { useCurrentOrganization } from "@/hooks/useCurrentOrganization";
import styles from "./OrgSelector.module.css";

export function OrgSelector() {
  const t = useTranslations("common");
  const { message } = App.useApp();
  const {
    organizations,
    loading,
    error,
    currentOrgId,
    setCurrentOrgId,
  } = useCurrentOrganization();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const orgOptions = useMemo(
    () =>
      (organizations ?? []).map((org) => ({
        label: org.name,
        value: org.id,
      })),
    [organizations],
  );

  const handleOrgChange = (value: string) => {
    setCurrentOrgId(value);
    const selected = organizations?.find((org) => org.id === value);
    if (selected) {
      message.success(t("switchedTo", { name: selected.name }));
    }
  };

  const popupRender = (menu: React.ReactNode) => (
    <>
      {menu}
      <div className={styles.popupFooter}>
        {organizations && organizations.length > 0 ? (
          <Link href="/org/settings" className={styles.popupLink}>
            {t("orgSettings")}
          </Link>
        ) : null}
      </div>
    </>
  );

  if (!mounted) {
    return (
      <div
        className={styles.selectSkeleton}
        aria-hidden
      />
    );
  }

  return (
    <div className={styles.root}>
      <Select
        className={styles.select}
        placeholder={t("organization")}
        loading={loading}
        status={error ? "error" : undefined}
        value={currentOrgId ?? undefined}
        onChange={handleOrgChange}
        options={orgOptions}
        aria-label={t("organization")}
        popupRender={popupRender}
      />
      {!loading && !error && organizations && organizations.length === 0 ? (
        <p className={styles.emptyHint}>
          {t("noOrgsCreateOne")} <Link href="/org/create">{t("createOne")}</Link>
        </p>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
