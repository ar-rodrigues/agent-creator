import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertSystemAdmin } from "@/lib/modules/server";
import type { ModuleToggleSource } from "@/lib/modules/constants";

/**
 * GET /api/system/modules
 * Returns all org module states across all orgs.
 * Query params:
 *   ?orgId=<uuid>     – filter to a single org
 *   ?moduleKey=<key>  – filter to a single module
 */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await assertSystemAdmin(user.id);
  } catch {
    return NextResponse.json(
      { error: "Forbidden: system admin access required" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  const moduleKey = searchParams.get("moduleKey");

  let query = supabase
    .from("org_module_states")
    .select(
      "id, org_id, module_key, enabled, source, updated_by, updated_reason, updated_at",
    )
    .order("org_id")
    .order("module_key");

  if (orgId) query = query.eq("org_id", orgId);
  if (moduleKey) query = query.eq("module_key", moduleKey);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ modules: data });
}

type BulkPatchBody = {
  orgId: string;
  moduleKey: string;
  enabled: boolean;
  reason?: string;
  source?: ModuleToggleSource;
}[];

/**
 * PATCH /api/system/modules
 * Bulk-upsert module states across any number of orgs. System admin only.
 * Body: array of { orgId, moduleKey, enabled, reason?, source? }
 */
export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await assertSystemAdmin(user.id);
  } catch {
    return NextResponse.json(
      { error: "Forbidden: system admin access required" },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as BulkPatchBody | null;
  if (!Array.isArray(body) || body.length === 0) {
    return NextResponse.json(
      { error: "Body must be a non-empty array of module state updates" },
      { status: 400 },
    );
  }

  const rows = body.map((item) => ({
    org_id: item.orgId,
    module_key: item.moduleKey,
    enabled: item.enabled,
    updated_by: user.id,
    updated_reason: item.reason ?? null,
    source: item.source ?? "manual",
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from("org_module_states")
    .upsert(rows, { onConflict: "org_id,module_key" })
    .select("org_id, module_key, enabled, source, updated_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ updated: data });
}
