import { redirect as nextRedirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PrivateHeader } from "@/components/PrivateHeader";
import { Footer } from "@/components/Footer";
import { OrgSelector } from "@/components/org/OrgSelector";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import styles from "./layout.module.css";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function PrivateLayout({ children, params }: Props) {
  const { locale } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    nextRedirect(`${prefix}/auth?session_invalid=1`);
  }

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true });
  const hasOrgs = Array.isArray(orgs) && orgs.length > 0;
  const t = await getTranslations("common");

  return (
    <div className={styles.wrapper}>
      <PrivateHeader />
      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <nav className={styles.nav}>
            <Link href="/dashboard" className={styles.navLink}>
              {t("dashboard")}
            </Link>
            {hasOrgs ? (
              <>
                <Link href="/dashboard/knowledge" className={styles.navLink}>
                  {t("knowledge")}
                </Link>
                <Link href="/org/settings" className={styles.navLink}>
                  {t("orgSettings")}
                </Link>
              </>
            ) : null}
          </nav>
          <div className={styles.sidebarFooter}>
            <OrgSelector />
          </div>
        </aside>
        <main className={styles.main}>{children}</main>
      </div>
      <Footer />
    </div>
  );
}
