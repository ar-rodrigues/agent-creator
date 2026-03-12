import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import {
  getAvailableChatModels,
  getAvailableEmbeddingModels,
} from "@/lib/llm/modelRegistry";

type Params = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;
  if (!orgId) {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  }

  const canManage = await hasPermission(orgId, user.id, "ORG_MANAGE_MEMBERS");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [embeddingModels, chatModels] = await Promise.all([
    getAvailableEmbeddingModels(),
    getAvailableChatModels(),
  ]);

  return NextResponse.json({
    embeddingModels,
    chatModels,
  });
}

