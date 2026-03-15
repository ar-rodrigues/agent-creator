import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import type { ModuleKey, ModuleToggleSource } from "./constants";

export type OrgModuleState = {
  moduleKey: string;
  enabled: boolean;
  source: ModuleToggleSource;
  updatedBy: string | null;
  updatedReason: string | null;
  updatedAt: string;
};

export type ModuleAccessError =
  | "MODULE_DISABLED"
  | "PERMISSION_DENIED"
  | "UNAUTHENTICATED";

export type VerifyModuleAccessResult =
  | { ok: true }
  | { ok: false; reason: ModuleAccessError };

/**
 * Returns all module states for an org, keyed by module_key.
 * Falls back to an empty map on DB error (safe for UI consumption).
 */
export async function getOrgModuleStates(
  orgId: string,
): Promise<Record<string, OrgModuleState>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("org_module_states")
    .select("module_key, enabled, source, updated_by, updated_reason, updated_at")
    .eq("org_id", orgId);

  if (error || !data) return {};

  return Object.fromEntries(
    data.map((row) => [
      row.module_key,
      {
        moduleKey: row.module_key,
        enabled: row.enabled,
        source: row.source as ModuleToggleSource,
        updatedBy: row.updated_by,
        updatedReason: row.updated_reason,
        updatedAt: row.updated_at,
      },
    ]),
  );
}

/**
 * Returns true when the given module is enabled for the org.
 * An absent row is treated as disabled.
 */
export async function isModuleEnabledForOrg(
  orgId: string,
  moduleKey: ModuleKey,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("org_module_states")
    .select("enabled")
    .eq("org_id", orgId)
    .eq("module_key", moduleKey)
    .maybeSingle();

  return data?.enabled === true;
}

/**
 * Returns true when the authenticated user is a system admin.
 * Calls the is_system_admin() DB function via an RPC stub.
 */
export async function isSystemAdmin(userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("system_user_roles")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  return data !== null;
}

/**
 * Asserts the user is a system admin. Throws with a descriptive message on failure.
 * Use at the top of system-admin-only route handlers.
 */
export async function assertSystemAdmin(userId: string): Promise<void> {
  const ok = await isSystemAdmin(userId);
  if (!ok) {
    throw new Error("SYSTEM_ADMIN_REQUIRED");
  }
}

/**
 * Composed access check: verifies a module is enabled for the org AND the
 * user holds the required org permission (when supplied).
 *
 * Returns { ok: true } or { ok: false, reason } — never throws.
 */
export async function verifyModuleAccess({
  orgId,
  userId,
  moduleKey,
  requiredPermission,
}: {
  orgId: string;
  userId: string;
  moduleKey: ModuleKey;
  requiredPermission?: string;
}): Promise<VerifyModuleAccessResult> {
  const [enabled, permOk] = await Promise.all([
    isModuleEnabledForOrg(orgId, moduleKey),
    requiredPermission
      ? hasPermission(orgId, userId, requiredPermission)
      : Promise.resolve(true),
  ]);

  if (!enabled) return { ok: false, reason: "MODULE_DISABLED" };
  if (!permOk) return { ok: false, reason: "PERMISSION_DENIED" };
  return { ok: true };
}
