import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/layout/Container";
import { Stack } from "@/components/layout/Stack";
import { Card } from "@/components/ui/Card";
import styles from "./page.module.css";

type Props = { params: Promise<{ locale: string }> };

export default async function CheckEmailPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <Container size="sm">
      <Stack gap="6">
        <Card padding="lg">
          <Stack gap="4">
            <h1 className={styles.title}>{t("checkEmailPageTitle")}</h1>
            <p className={styles.description}>
              {t("checkEmailPageDescription")}
            </p>
            <div className={styles.actions}>
              <Link href="/auth" className={styles.primary}>
                {t("signInNow")}
              </Link>
              <Link href="/" className={styles.secondary}>
                {t("backToHome")}
              </Link>
            </div>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
