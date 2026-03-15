import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSystemAdmin } from "@/lib/modules/server";

/** GET /api/system/admin-check — returns whether the current user is a system admin */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ isSystemAdmin: false }, { status: 401 });
  }

  const admin = await isSystemAdmin(user.id);
  return NextResponse.json({ isSystemAdmin: admin });
}
