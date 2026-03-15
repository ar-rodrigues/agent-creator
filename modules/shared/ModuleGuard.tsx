"use client";

import { useTranslations } from "next-intl";
import type { ModuleKey } from "@/lib/modules/constants";
import type { UseOrgModulesReturn } from "@/hooks/useOrgModules";

type Props = {
  moduleKey: ModuleKey;
  modules: UseOrgModulesReturn;
  children: React.ReactNode;
  /**
   * Optional custom fallback rendered when the module is disabled.
   * Defaults to a localized "module disabled" message.
   */
  fallback?: React.ReactNode;
};

/**
 * Renders children only when the module is enabled for the current org.
 * Shows a localized disabled state otherwise.
 * Pass the `modules` return value from `useOrgModules` to avoid redundant fetches.
 */
export function ModuleGuard({ moduleKey, modules, children, fallback }: Props) {
  const t = useTranslations("modules");

  if (modules.loading) return null;

  if (!modules.isEnabled(moduleKey)) {
    return fallback ?? (
      <div style={{ padding: "2rem", textAlign: "center", opacity: 0.6 }}>
        <p>{t("disabled")}</p>
        <p style={{ fontSize: "0.875rem" }}>{t("disabledContactAdmin")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
