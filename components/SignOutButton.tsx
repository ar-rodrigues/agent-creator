"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "antd";
import { useAuth } from "@/hooks/useAuth";

export function SignOutButton() {
  const t = useTranslations("common");
  const router = useRouter();
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <Button type="default" onClick={handleSignOut}>
      {t("signOut")}
    </Button>
  );
}
