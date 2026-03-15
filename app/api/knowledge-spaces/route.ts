import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json(
      { error: "orgId query parameter is required" },
      { status: 400 },
    );
  }

  const canRead = await hasPermission(orgId, user.id, "KNOWLEDGE_SPACE_READ");
  if (!canRead) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("knowledge_spaces")
    .select("id, name, scope, project_id, created_at, summary_i18n")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ knowledge_spaces: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    orgId?: string;
    name?: string;
    scope?: "general" | "project" | "agent";
    projectId?: string | null;
  } | null;

  const orgId = body?.orgId?.trim();
  const name = body?.name?.trim();
  const scope = body?.scope ?? "general";
  const projectId = body?.projectId || null;

  if (!orgId || !name) {
    return NextResponse.json(
      { error: "orgId and name are required" },
      { status: 400 },
    );
  }

  if (!["general", "project", "agent"].includes(scope)) {
    return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  }

  const canCreate = await hasPermission(orgId, user.id, "KNOWLEDGE_SPACE_CREATE");
  if (!canCreate) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("knowledge_spaces")
    .insert({
      org_id: orgId,
      name,
      scope,
      project_id: projectId || null,
      created_by: user.id,
    })
    .select("id, name, scope, project_id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ knowledge_space: data }, { status: 201 });
}
