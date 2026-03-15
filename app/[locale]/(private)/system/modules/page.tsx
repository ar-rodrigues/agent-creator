import { redirect as nextRedirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSystemAdmin } from "@/lib/modules/server";
import { routing } from "@/i18n/routing";
import { SystemModulesManager } from "./_components/SystemModulesManager";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function SystemModulesPage({ params }: Props) {
  const { locale } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    nextRedirect(`${prefix}/auth?session_invalid=1`);
  }

  const admin = await isSystemAdmin(user!.id);
  if (!admin) {
    const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    nextRedirect(`${prefix}/dashboard`);
  }

  const t = await getTranslations("systemAdmin");

  return (
    <div style={{ padding: "1.5rem" }}>
      <h1 style={{ marginBottom: "1.5rem" }}>{t("modulesTitle")}</h1>
      <SystemModulesManager />
    </div>
  );
}
