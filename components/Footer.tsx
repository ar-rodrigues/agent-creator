import { Link } from "@/i18n/navigation";
import styles from "./Footer.module.css";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <nav className={styles.links}>
          <Link href="/" className={styles.link}>
            Home
          </Link>
        </nav>
        <p className={styles.copyright}>
          © {currentYear} Agent Creator
        </p>
      </div>
    </footer>
  );
}
