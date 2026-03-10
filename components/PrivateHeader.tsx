"use client";

import { Link } from "@/i18n/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { SignOutButton } from "./SignOutButton";
import styles from "./PrivateHeader.module.css";

export function PrivateHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/dashboard" className={styles.logo}>
          Agent Creator
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
