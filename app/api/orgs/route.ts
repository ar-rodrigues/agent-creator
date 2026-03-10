import {NextResponse} from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServerClientWithToken,
} from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  const {data, error} = await supabase
    .from("organizations")
    .select("id, name, created_at")
    .order("created_at", {ascending: true});

  if (error) {
    return NextResponse.json({error: error.message}, {status: 500});
  }

  return NextResponse.json({organizations: data ?? []});
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  const body = await request.json().catch(() => null) as {name?: string} | null;
  const name = body?.name?.trim();

  if (!name) {
    return NextResponse.json({error: "Organization name is required"}, {status: 400});
  }

  const {
    data: {session},
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  const supabaseWithToken = createSupabaseServerClientWithToken(session.access_token);
  const {data, error} = await supabaseWithToken.rpc("create_organization_for_user", {org_name: name});

  if (error) {
    return NextResponse.json({error: error.message}, {status: 500});
  }

  return NextResponse.json({organization: data}, {status: 201});
}

