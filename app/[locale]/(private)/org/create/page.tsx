import {redirect as nextRedirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {OrgCreateForm} from "@/components/org/OrgCreateForm";

type Props = {
  params: Promise<{locale: string}>;
};

export default async function CreateOrganizationPage({params}: Props) {
  const {locale} = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    const prefix = locale === "en" ? "" : `/${locale}`;
    nextRedirect(`${prefix}/auth?session_invalid=1`);
  }

  const {data: organizations} = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", {ascending: true});

  if (organizations && organizations.length > 0) {
    const prefix = locale === "en" ? "" : `/${locale}`;
    nextRedirect(`${prefix}/dashboard`);
  }

  return (
    <div>
      <OrgCreateForm />
    </div>
  );
}

