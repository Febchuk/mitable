import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { listInvitationsForSchool } from "@/lib/teachers/invitations";
import { adminWriteRoute } from "@/lib/admin/route-helper";
import { setTeacherUiHidden } from "@/lib/admin/crud";
import { SetTeacherUiHiddenSchema } from "@/lib/schemas/admin";
import {
  loadUiHiddenSets,
  revealHiddenFromRequest,
  shouldFilterUiHidden,
} from "@/lib/visibility/ui-hidden";

/**
 * Roster for /admin/teachers. Returns one entry per teacher: existing `users`
 * rows (Active) plus pending/expired invitations that haven't been claimed.
 *
 * Status reconciliation:
 *   - users.status='active' → "Active"
 *   - latest unclaimed teacher_invitation, expires_at > now() → "Invited"
 *   - latest unclaimed teacher_invitation, expires_at <= now() → "Expired"
 *
 * If both a Pending invite AND an Active user exist for the same email
 * (rare race), Active wins.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const filterHidden = shouldFilterUiHidden(auth.user.role, revealHiddenFromRequest(req));

  // Service-role read so we don't depend on the JWT-claim-based RLS path
  // (which requires the Custom Access Token Hook). All queries below are
  // explicitly scoped by auth.user.schoolId, so cross-school leakage isn't
  // possible.
  const supabase = createAdminClient();
  const hidden = filterHidden
    ? await loadUiHiddenSets(supabase, auth.user.schoolId)
    : { classroomIds: new Set<string>(), teacherIds: new Set<string>() };

  // Active teachers — real users rows.
  const { data: users, error: usersErr } = await supabase
    .from("users")
    .select("id, first_name, last_name, email, status, created_at, ui_hidden")
    .eq("school_id", auth.user.schoolId)
    .eq("role", "teacher");
  if (usersErr) {
    return NextResponse.json({ error: usersErr.message }, { status: 500 });
  }

  const visibleUsers = (users ?? []).filter(
    (u) => !filterHidden || !hidden.teacherIds.has((u as { id: string }).id)
  );

  // All invitations for the school. We'll reduce to the most recent unclaimed
  // entry per email; claimed entries are dropped because the active user row
  // covers them.
  const invitations = await listInvitationsForSchool(supabase, auth.user.schoolId);

  // Classroom assignments to enrich the response with classroom names.
  const teacherIds = visibleUsers.map((u) => (u as { id: string }).id);
  let assignmentsByTeacher: Record<string, string[]> = {};
  if (teacherIds.length > 0) {
    const { data: assignments } = await supabase
      .from("classroom_teacher_assignments")
      .select("teacher_user_id, classroom_id, classrooms(name)")
      .in("teacher_user_id", teacherIds)
      .is("end_date", null);
    assignmentsByTeacher = (assignments ?? []).reduce<Record<string, string[]>>((acc, raw) => {
      const row = raw as {
        teacher_user_id: string;
        classroom_id: string;
        classrooms: { name: string } | { name: string }[] | null;
      };
      if (filterHidden && hidden.classroomIds.has(row.classroom_id)) return acc;
      const c = Array.isArray(row.classrooms) ? row.classrooms[0] : row.classrooms;
      if (!c) return acc;
      acc[row.teacher_user_id] = [...(acc[row.teacher_user_id] ?? []), c.name];
      return acc;
    }, {});
  }

  const now = Date.now();
  const activeEmails = new Set(
    visibleUsers.map((u) => (u as { email: string }).email.toLowerCase())
  );

  type RosterEntry = {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    classrooms: string[];
    status: "Active" | "Invited" | "Expired";
    invitationId?: string;
    invitedAt?: string;
    expiresAt?: string;
    joinedAt?: string;
    uiHidden?: boolean;
  };

  const roster: RosterEntry[] = visibleUsers.map((u) => {
    const row = u as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      status: string;
      created_at: string;
      ui_hidden?: boolean;
    };
    return {
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      classrooms: assignmentsByTeacher[row.id] ?? [],
      status: "Active",
      joinedAt: row.created_at,
      uiHidden: Boolean(row.ui_hidden),
    };
  });

  // Reduce invitations: keep only the most recent unclaimed row per email
  // whose email isn't already represented by an Active user.
  const seenEmails = new Set<string>();
  for (const inv of invitations) {
    const lower = inv.email.toLowerCase();
    if (inv.claimed_at) continue;
    if (activeEmails.has(lower)) continue;
    if (seenEmails.has(lower)) continue;
    seenEmails.add(lower);
    const expired = new Date(inv.expires_at).getTime() <= now;
    roster.push({
      id: `invite:${inv.id}`,
      email: inv.email,
      firstName: null,
      lastName: null,
      classrooms: [],
      status: expired ? "Expired" : "Invited",
      invitationId: inv.id,
      invitedAt: inv.created_at,
      expiresAt: inv.expires_at,
    });
  }

  return NextResponse.json({ teachers: roster });
}

export async function PATCH(req: Request) {
  return adminWriteRoute(
    req,
    SetTeacherUiHiddenSchema,
    "admin_set_teacher_ui_hidden",
    async (input, ctx) => {
      await setTeacherUiHidden(ctx, input.teacher_user_id, input.ui_hidden);
      return { id: input.teacher_user_id, ui_hidden: input.ui_hidden };
    }
  );
}
