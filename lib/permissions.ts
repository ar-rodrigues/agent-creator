import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Resolves the set of permission keys for a user in an organization
 * (union of all permissions from every seat they are assigned to).
 */
export async function getUserPermissions(
  orgId: string,
  userId: string,
): Promise<Set<string>> {
  const supabase = await createSupabaseServerClient();

  const { data: orgSeats, error: seatsErr } = await supabase
    .from("org_seats")
    .select("id, seat_type_id")
    .eq("org_id", orgId);

  if (seatsErr || !orgSeats?.length) {
    return new Set();
  }

  const orgSeatIds = orgSeats.map((s) => s.id);
  const { data: assignments, error: assignErr } = await supabase
    .from("seat_assignments")
    .select("org_seat_id")
    .eq("user_id", userId)
    .in("org_seat_id", orgSeatIds);

  if (assignErr || !assignments?.length) {
    return new Set();
  }

  const assignedSeatIds = new Set(assignments.map((a) => a.org_seat_id));
  const seatTypeIds = [
    ...new Set(
      orgSeats
        .filter((s) => assignedSeatIds.has(s.id))
        .map((s) => s.seat_type_id),
    ),
  ];

  if (seatTypeIds.length === 0) {
    return new Set();
  }

  const { data: links, error: linkErr } = await supabase
    .from("seat_type_permissions")
    .select("permission_code_id")
    .in("seat_type_id", seatTypeIds);

  if (linkErr || !links?.length) {
    return new Set();
  }

  const codeIds = [...new Set(links.map((l) => l.permission_code_id))];
  const { data: codes, error: codeErr } = await supabase
    .from("permission_codes")
    .select("key")
    .in("id", codeIds);

  if (codeErr || !codes?.length) {
    return new Set();
  }

  return new Set(codes.map((c) => c.key));
}

/**
 * Returns true if the user has the given permission in the organization.
 */
export async function hasPermission(
  orgId: string,
  userId: string,
  permissionKey: string,
): Promise<boolean> {
  const permissions = await getUserPermissions(orgId, userId);
  return permissions.has(permissionKey);
}
