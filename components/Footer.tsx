import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import styles from "./Footer.module.css";

export async function Footer() {
  const t = await getTranslations("common");
  const currentYear = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <nav className={styles.links}>
          <Link href="/" className={styles.link}>
            {t("home")}
          </Link>
        </nav>
        <p className={styles.copyright}>
          {t("copyright", { year: currentYear })}
        </p>
      </div>
    </footer>
  );
}
