"use client";

import { useRouter, usePathname } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import styles from "./LanguageSwitcher.module.css";

export function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  const handleChange = (newLocale: string) => {
    if (newLocale === locale) return;
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <div className={styles.wrapper} role="group" aria-label="Language">
      {routing.locales.map((loc) => (
        <button
          key={loc}
          type="button"
          className={styles.button}
          aria-pressed={locale === loc}
          onClick={() => handleChange(loc)}
          title={loc === "en" ? "English" : loc === "es" ? "Español" : loc}
        >
          {loc.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
