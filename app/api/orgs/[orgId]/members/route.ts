import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";

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

  const { data: memberships, error: memErr } = await supabase
    .from("org_memberships")
    .select("id, user_id, role, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }

  if (!memberships?.length) {
    return NextResponse.json({ members: [] });
  }

  const userIds = [...new Set(memberships.map((m) => m.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, display_name")
    .in("id", userIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, { email: p.email ?? null, display_name: p.display_name ?? null }]),
  );

  const { data: orgSeats } = await supabase
    .from("org_seats")
    .select("id, seat_type_id")
    .eq("org_id", orgId);
  const orgSeatIds = (orgSeats ?? []).map((s) => s.id);
  const seatTypeIds = [...new Set((orgSeats ?? []).map((s) => s.seat_type_id))];
  const { data: seatTypes } = await supabase
    .from("seat_types")
    .select("id, key, name")
    .in("id", seatTypeIds);
  const seatTypeMap = new Map((seatTypes ?? []).map((st) => [st.id, { key: st.key, name: st.name }]));
  const orgSeatToType = new Map(
    (orgSeats ?? []).map((s) => [s.id, seatTypeMap.get(s.seat_type_id)]),
  );

  const { data: assignments } = await supabase
    .from("seat_assignments")
    .select("org_seat_id, user_id")
    .in("org_seat_id", orgSeatIds)
    .in("user_id", userIds);

  const userToSeatType = new Map<string, { key: string; name: string }>();
  for (const a of assignments ?? []) {
    const st = orgSeatToType.get(a.org_seat_id);
    if (st) userToSeatType.set(a.user_id, st);
  }

  const members = memberships.map((m) => {
    const profile = profileMap.get(m.user_id);
    const seat = userToSeatType.get(m.user_id);
    return {
      id: m.id,
      user_id: m.user_id,
      email: profile?.email ?? null,
      display_name: profile?.display_name ?? null,
      role: m.role,
      seat_type_key: seat?.key ?? null,
      seat_type_name: seat?.name ?? null,
      created_at: m.created_at,
    };
  });

  return NextResponse.json({ members });
}

export async function POST(request: Request, { params }: Params) {
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

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    seat_type_key?: string;
  } | null;
  const email = body?.email?.trim()?.toLowerCase();
  const seatTypeKey = (body?.seat_type_key ?? "USER").toUpperCase();

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  if (seatTypeKey !== "ADMIN" && seatTypeKey !== "USER") {
    return NextResponse.json({ error: "seat_type_key must be ADMIN or USER" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (!profile?.id) {
    return NextResponse.json(
      { error: "User with this email has not signed up yet" },
      { status: 404 },
    );
  }

  const inviteeId = profile.id;
  if (inviteeId === user.id) {
    return NextResponse.json({ error: "You are already a member" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("org_memberships")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", inviteeId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "User is already a member of this organization" }, { status: 409 });
  }

  const { data: seatType } = await supabase
    .from("seat_types")
    .select("id")
    .eq("key", seatTypeKey)
    .single();
  if (!seatType?.id) {
    return NextResponse.json({ error: "Seat type not found" }, { status: 500 });
  }

  let { data: orgSeat } = await supabase
    .from("org_seats")
    .select("id")
    .eq("org_id", orgId)
    .eq("seat_type_id", seatType.id)
    .limit(1)
    .maybeSingle();

  if (!orgSeat) {
    const { data: newSeat, error: seatErr } = await supabase
      .from("org_seats")
      .insert({ org_id: orgId, seat_type_id: seatType.id })
      .select("id")
      .single();
    if (seatErr || !newSeat) {
      return NextResponse.json({ error: seatErr?.message ?? "Failed to create seat" }, { status: 500 });
    }
    orgSeat = newSeat;
  }

  const { data: seatTypeRow } = await supabase
    .from("seat_types")
    .select("max_users")
    .eq("id", seatType.id)
    .single();
  const maxUsers = seatTypeRow?.max_users ?? 100;
  const { count: assigned } = await supabase
    .from("seat_assignments")
    .select("id", { count: "exact", head: true })
    .eq("org_seat_id", orgSeat.id);
  if ((assigned ?? 0) >= maxUsers) {
    return NextResponse.json({ error: "No seats available for this role" }, { status: 400 });
  }

  const role = seatTypeKey === "ADMIN" ? "admin" : "member";
  const { data: membership, error: memErr } = await supabase
    .from("org_memberships")
    .insert({ org_id: orgId, user_id: inviteeId, role })
    .select("id, user_id, role, created_at")
    .single();

  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }

  const { error: assignErr } = await supabase
    .from("seat_assignments")
    .insert({ org_seat_id: orgSeat.id, user_id: inviteeId });

  if (assignErr) {
    await supabase.from("org_memberships").delete().eq("id", membership.id);
    return NextResponse.json({ error: assignErr.message }, { status: 500 });
  }

  const profileRow = await supabase
    .from("profiles")
    .select("email, display_name")
    .eq("id", inviteeId)
    .single();
  return NextResponse.json(
    {
      member: {
        id: membership.id,
        user_id: membership.user_id,
        email: profileRow.data?.email ?? null,
        display_name: profileRow.data?.display_name ?? null,
        role: membership.role,
        seat_type_key: seatTypeKey,
        created_at: membership.created_at,
      },
    },
    { status: 201 },
  );
}
