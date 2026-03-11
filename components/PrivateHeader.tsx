"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { SignOutButton } from "./SignOutButton";
import styles from "./PrivateHeader.module.css";

export function PrivateHeader() {
  const t = useTranslations("common");
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/dashboard" className={styles.logo}>
          {t("appName")}
        </Link>
        <div className={styles.actions}>
          <ThemeToggle />
          <LanguageSwitcher />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}

