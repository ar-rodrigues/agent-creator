import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/layout/Container";
import { Stack } from "@/components/layout/Stack";
import styles from "./page.module.css";

type Props = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <div className={styles.page}>
      <Container size="md" className={styles.main}>
        <Stack gap="6" className={styles.intro}>
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </Stack>
        <div className={styles.ctas}>
          <Link href="/auth" className={styles.ctaPrimary}>
            {t("signIn")}
          </Link>
          <Link href="/auth?mode=signup" className={styles.ctaSecondary}>
            {t("signUp")}
          </Link>
        </div>
      </Container>
    </div>
  );
}
