import { redirect as nextRedirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PrivateHeader } from "@/components/PrivateHeader";
import { Footer } from "@/components/Footer";
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
    const prefix =
      locale === routing.defaultLocale ? "" : `/${locale}`;
    nextRedirect(`${prefix}/auth?session_invalid=1`);
  }

  return (
    <div className={styles.wrapper}>
      <PrivateHeader />
      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <nav className={styles.nav}>
            <Link href="/dashboard" className={styles.navLink}>
              Dashboard
            </Link>
          </nav>
        </aside>
        <main className={styles.main}>{children}</main>
      </div>
      <Footer />
    </div>
  );
}
