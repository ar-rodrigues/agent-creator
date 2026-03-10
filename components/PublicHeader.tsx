"use client";

import { Link } from "@/i18n/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import styles from "./PublicHeader.module.css";

export function PublicHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo}>
          Agent Creator
        </Link>
        <div className={styles.actions}>
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
