import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import {
  assertSystemAdmin,
  getOrgModuleStates,
} from "@/lib/modules/server";
import type { ModuleToggleSource } from "@/lib/modules/constants";

type Params = { params: Promise<{ orgId: string }> };

/** GET /api/orgs/[orgId]/modules — readable by org members */
export async function GET(_request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;

  const canView = await hasPermission(orgId, user.id, "ORG_VIEW");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const modules = await getOrgModuleStates(orgId);
  return NextResponse.json({ modules });
}

type PatchBody = {
  moduleKey: string;
  enabled: boolean;
  reason?: string;
  source?: ModuleToggleSource;
};

/** PATCH /api/orgs/[orgId]/modules — system admins only */
export async function PATCH(request: Request, { params }: Params) {
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

  const { orgId } = await params;

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body?.moduleKey || typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "moduleKey and enabled are required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("org_module_states")
    .upsert(
      {
        org_id: orgId,
        module_key: body.moduleKey,
        enabled: body.enabled,
        updated_by: user.id,
        updated_reason: body.reason ?? null,
        source: body.source ?? "manual",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,module_key" },
    )
    .select("module_key, enabled, source, updated_by, updated_reason, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ module: data });
}
