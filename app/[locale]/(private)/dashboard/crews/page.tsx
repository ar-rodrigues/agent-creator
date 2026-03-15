import { redirect as nextRedirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyModuleAccess } from "@/lib/modules/server";
import { MODULE_KEYS } from "@/lib/modules/constants";
import { routing } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function CrewsPage({ params }: Props) {
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
  const activeOrgId = Array.isArray(orgs) && orgs.length > 0 ? orgs[0].id : null;

  if (!activeOrgId) {
    const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    nextRedirect(`${prefix}/dashboard`);
  }

  const access = await verifyModuleAccess({
    orgId: activeOrgId,
    userId: user.id,
    moduleKey: MODULE_KEYS.CREWS,
  });
  if (!access.ok) {
    const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    nextRedirect(`${prefix}/dashboard`);
  }

  const t = await getTranslations("common");

  return (
    <div style={{ padding: "1.5rem" }}>
      <h1>{t("crews")}</h1>
    </div>
  );
}
