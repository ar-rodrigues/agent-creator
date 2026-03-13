import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";

/**
 * GET /api/documents?orgId=...
 * Returns documents for the org that are linked to at least one general knowledge space.
 * Requires KNOWLEDGE_SPACE_READ (everyone in org can see the list).
 */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId")?.trim();

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

  // 1) Get general knowledge space ids for this org
  const { data: generalSpaces, error: spacesError } = await supabase
    .from("knowledge_spaces")
    .select("id")
    .eq("org_id", orgId)
    .eq("scope", "general");

  if (spacesError || !generalSpaces?.length) {
    return NextResponse.json({ documents: [] });
  }

  const spaceIds = generalSpaces.map((s) => s.id);

  // 2) Get document ids linked to any of those spaces
  const { data: links, error: linksError } = await supabase
    .from("document_knowledge_spaces")
    .select("document_id")
    .in("knowledge_space_id", spaceIds);

  if (linksError) {
    return NextResponse.json(
      { error: linksError.message ?? "Failed to load document links" },
      { status: 500 },
    );
  }

  const documentIds = [...new Set((links ?? []).map((l) => l.document_id))];
  if (documentIds.length === 0) {
    return NextResponse.json({ documents: [] });
  }

  // 3) Fetch documents (org-scoped)
  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("id, filename, created_at, content_type")
    .eq("org_id", orgId)
    .in("id", documentIds)
    .order("created_at", { ascending: false });

  if (docsError) {
    return NextResponse.json(
      { error: docsError.message ?? "Failed to load documents" },
      { status: 500 },
    );
  }

  return NextResponse.json({ documents: docs ?? [] });
}
