import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";

type Params = { params: Promise<{ orgId: string; membershipId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId, membershipId } = await params;
  if (!orgId || !membershipId) {
    return NextResponse.json({ error: "orgId and membershipId are required" }, { status: 400 });
  }

  const canManage = await hasPermission(orgId, user.id, "ORG_MANAGE_MEMBERS");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    role?: string;
    seat_type_key?: string;
  } | null;
  const role = body?.role?.trim()?.toLowerCase();
  const seatTypeKey = body?.seat_type_key?.trim()?.toUpperCase();

  if (!role && !seatTypeKey) {
    return NextResponse.json({ error: "role or seat_type_key is required" }, { status: 400 });
  }
  if (role && role !== "admin" && role !== "member") {
    return NextResponse.json({ error: "role must be admin or member" }, { status: 400 });
  }
  if (seatTypeKey && seatTypeKey !== "ADMIN" && seatTypeKey !== "USER") {
    return NextResponse.json({ error: "seat_type_key must be ADMIN or USER" }, { status: 400 });
  }

  const { data: membership, error: fetchErr } = await supabase
    .from("org_memberships")
    .select("id, org_id, user_id, role")
    .eq("id", membershipId)
    .eq("org_id", orgId)
    .single();

  if (fetchErr || !membership) {
    return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  }

  const updates: { role?: string } = {};
  if (role) updates.role = role;

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await supabase
      .from("org_memberships")
      .update(updates)
      .eq("id", membershipId);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  }

  if (seatTypeKey) {
    const { data: newSeatType } = await supabase
      .from("seat_types")
      .select("id")
      .eq("key", seatTypeKey)
      .single();
    if (!newSeatType?.id) {
      return NextResponse.json({ error: "Seat type not found" }, { status: 500 });
    }

    const { data: orgSeats } = await supabase
      .from("org_seats")
      .select("id, seat_type_id")
      .eq("org_id", orgId);
    const currentSeat = (orgSeats ?? []).find((s) => s.seat_type_id === newSeatType.id);
    let targetOrgSeatId: string | null = currentSeat?.id ?? null;

    if (!targetOrgSeatId) {
      const { data: newOrgSeat, error: createSeatErr } = await supabase
        .from("org_seats")
        .insert({ org_id: orgId, seat_type_id: newSeatType.id })
        .select("id")
        .single();
      if (createSeatErr || !newOrgSeat) {
        return NextResponse.json({ error: createSeatErr?.message ?? "Failed to create seat" }, { status: 500 });
      }
      targetOrgSeatId = newOrgSeat.id;
    }

    const orgSeatIds = (orgSeats ?? []).map((s) => s.id);
    const { data: existingAssignments } = await supabase
      .from("seat_assignments")
      .select("id, org_seat_id")
      .eq("user_id", membership.user_id)
      .in("org_seat_id", orgSeatIds);

    for (const a of existingAssignments ?? []) {
      const { error: delErr } = await supabase
        .from("seat_assignments")
        .delete()
        .eq("id", a.id);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }
    }

    const { error: assignErr } = await supabase.from("seat_assignments").insert({
      org_seat_id: targetOrgSeatId,
      user_id: membership.user_id,
    });
    if (assignErr) {
      return NextResponse.json({ error: assignErr.message }, { status: 500 });
    }
  }

  const { data: updated } = await supabase
    .from("org_memberships")
    .select("id, user_id, role, created_at")
    .eq("id", membershipId)
    .single();

  return NextResponse.json({ member: updated });
}

export async function DELETE(_request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId, membershipId } = await params;
  if (!orgId || !membershipId) {
    return NextResponse.json({ error: "orgId and membershipId are required" }, { status: 400 });
  }

  const canManage = await hasPermission(orgId, user.id, "ORG_MANAGE_MEMBERS");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: membership, error: fetchErr } = await supabase
    .from("org_memberships")
    .select("id, org_id, user_id")
    .eq("id", membershipId)
    .eq("org_id", orgId)
    .single();

  if (fetchErr || !membership) {
    return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  }

  const { data: orgSeats } = await supabase.from("org_seats").select("id").eq("org_id", orgId);
  const orgSeatIds = (orgSeats ?? []).map((s) => s.id);

  const { error: delAssignErr } = await supabase
    .from("seat_assignments")
    .delete()
    .eq("user_id", membership.user_id)
    .in("org_seat_id", orgSeatIds);

  if (delAssignErr) {
    return NextResponse.json({ error: delAssignErr.message }, { status: 500 });
  }

  const { error: delMemErr } = await supabase.from("org_memberships").delete().eq("id", membershipId);

  if (delMemErr) {
    return NextResponse.json({ error: delMemErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
