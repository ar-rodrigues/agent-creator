"use client";

import { useMemo, useState, useEffect } from "react";
import { Select, App } from "antd";
import { Link } from "@/i18n/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { SignOutButton } from "./SignOutButton";
import { useCurrentOrganization } from "@/hooks/useCurrentOrganization";
import styles from "./PrivateHeader.module.css";

export function PrivateHeader() {
  const { message } = App.useApp();
  const {
    organizations,
    loading,
    error,
    currentOrgId,
    currentOrganization,
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
      message.success(`Switched to ${selected.name}`);
    }
  };

  const orgLabel = currentOrganization?.name ?? "Select organization";

  const popupRender = (menu: React.ReactNode) => (
    <>
      {menu}
      <div style={{ padding: "8px 12px", borderTop: "1px solid var(--color-border)" }}>
        {organizations && organizations.length > 0 ? (
          <Link href="/org/settings" style={{ fontSize: 13 }}>
            Org settings
          </Link>
        ) : null}
      </div>
    </>
  );

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/dashboard" className={styles.logo}>
          Agent Creator
        </Link>
        <div className={styles.actions}>
          <div className={styles.orgSelector}>
            {mounted ? (
              <Select
                style={{ minWidth: 200 }}
                placeholder="Select organization"
                loading={loading}
                status={error ? "error" : undefined}
                value={currentOrgId ?? undefined}
                onChange={handleOrgChange}
                options={orgOptions}
                aria-label="Organization"
                popupRender={popupRender}
              />
            ) : (
              <div style={{ minWidth: 200, height: 32, background: "var(--color-surface-elevated)", borderRadius: 4 }} aria-hidden />
            )}
            {!loading && !error && organizations && organizations.length === 0 ? (
              <span className={styles.orgHint}>
                No organizations yet. Create one to get started.
              </span>
            ) : null}
            {error ? <span className={styles.orgError}>{error}</span> : null}
          </div>
          <span className={styles.orgName}>{orgLabel}</span>
          <ThemeToggle />
          <LanguageSwitcher />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}

