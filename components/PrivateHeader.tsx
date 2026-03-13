"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { SignOutButton } from "./SignOutButton";
import { useReindex } from "@/contexts/ReindexContext";
import styles from "./PrivateHeader.module.css";

function ReindexIndicator() {
  const { isReindexing, total, done } = useReindex();

  if (!isReindexing) return null;

  return (
    <div className={styles.reindexIndicator} title="Re-indexing documents with the new embedding model">
      <span className={styles.reindexSpinner} aria-hidden="true" />
      <span className={styles.reindexLabel}>
        Re-indexing {done}/{total}
      </span>
    </div>
  );
}

export function PrivateHeader() {
  const t = useTranslations("common");
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/dashboard" className={styles.logo}>
          {t("appName")}
        </Link>
        <div className={styles.actions}>
          <ReindexIndicator />
          <ThemeToggle />
          <LanguageSwitcher />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}

