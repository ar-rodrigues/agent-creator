import { redirect as nextRedirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PrivateHeader } from "@/components/PrivateHeader";
import { Footer } from "@/components/Footer";
import { OrgSelector } from "@/components/org/OrgSelector";
import { ReindexProvider } from "@/contexts/ReindexContext";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  type OrgModuleState,
  getOrgModuleStates,
  isSystemAdmin,
} from "@/lib/modules/server";
import { MODULE_KEYS } from "@/lib/modules/constants";
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

  // Load module states for the first (active) org and system admin status in parallel.
  const activeOrgId = hasOrgs ? orgs![0].id : null;
  const [moduleStates, systemAdmin] = await Promise.all([
    activeOrgId
      ? getOrgModuleStates(activeOrgId)
      : Promise.resolve({} as Record<string, OrgModuleState>),
    isSystemAdmin(user!.id),
  ]);

  const isKnowledgeEnabled = moduleStates[MODULE_KEYS.KNOWLEDGE]?.enabled !== false;
  const isSkillsEnabled = moduleStates[MODULE_KEYS.SKILLS]?.enabled === true;
  const isCrewsEnabled = moduleStates[MODULE_KEYS.CREWS]?.enabled === true;

  const t = await getTranslations("common");

  return (
    <ReindexProvider>
      <div className={styles.wrapper}>
        <PrivateHeader />
        <div className={styles.body}>
          <aside className={styles.sidebar}>
            <nav className={styles.nav}>
              <Link href="/dashboard" className={styles.navLink}>
                {t("dashboard")}
              </Link>
              <Link href="/profile" className={styles.navLink}>
                {t("profile")}
              </Link>
              {hasOrgs ? (
                <>
                  {isKnowledgeEnabled && (
                    <Link href="/dashboard/knowledge" className={styles.navLink}>
                      {t("knowledge")}
                    </Link>
                  )}
                  {isSkillsEnabled && (
                    <Link href="/dashboard/skills" className={styles.navLink}>
                      {t("skills")}
                    </Link>
                  )}
                  {isCrewsEnabled && (
                    <Link href="/dashboard/crews" className={styles.navLink}>
                      {t("crews")}
                    </Link>
                  )}
                  <Link href="/org/settings" className={styles.navLink}>
                    {t("orgSettings")}
                  </Link>
                </>
              ) : null}
              {systemAdmin && (
                <Link href="/system/modules" className={styles.navLink}>
                  {t("systemAdmin")}
                </Link>
              )}
            </nav>
            <div className={styles.sidebarFooter}>
              <OrgSelector />
            </div>
          </aside>
          <main className={styles.main}>{children}</main>
        </div>
        <Footer />
      </div>
    </ReindexProvider>
  );
}
