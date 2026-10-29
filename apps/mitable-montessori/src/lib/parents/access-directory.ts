import type { SupabaseClient } from "@supabase/supabase-js";

export type ParentAccessStatus =
  | "registered"
  | "setup_pending"
  | "invited"
  | "expired"
  | "not_invited"
  | "missing_email";
export type ParentAccessEntry = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: ParentAccessStatus;
  inviteExpiresAt: string | null;
  children: Array<{ id: string; name: string }>;
};

type GuardianRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  auth_user_id: string | null;
  onboarding_completed_at: string | null;
  guardian_invitations: Array<{ expires_at: string; claimed_at: string | null }>;
  student_guardians: Array<{
    students: { id: string; first_name: string; last_name: string; school_id: string } | null;
  }>;
};

/** Page through every guardian, including parents with no student link yet. */
export async function listParentAccess(
  db: SupabaseClient,
  schoolId: string,
  now = Date.now()
): Promise<ParentAccessEntry[]> {
  const entries: ParentAccessEntry[] = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await db
      .from("guardians")
      .select(
        "id, first_name, last_name, email, phone, auth_user_id, onboarding_completed_at, guardian_invitations(expires_at, claimed_at), student_guardians(students(id, first_name, last_name, school_id))"
      )
      .eq("school_id", schoolId)
      .order("first_name")
      .order("last_name")
      .order("id")
      .range(offset, offset + size - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as GuardianRow[];
    entries.push(
      ...rows.map((row) => {
        const latest = (row.guardian_invitations ?? [])
          .filter((invite) => !invite.claimed_at)
          .sort((a, b) => b.expires_at.localeCompare(a.expires_at))[0];
        const status: ParentAccessStatus = row.auth_user_id
          ? row.onboarding_completed_at
            ? "registered"
            : "setup_pending"
          : !row.email?.trim()
            ? "missing_email"
            : latest
              ? new Date(latest.expires_at).getTime() > now
                ? "invited"
                : "expired"
              : "not_invited";
        const children = new Map(
          (row.student_guardians ?? []).flatMap(({ students: child }) =>
            child?.school_id === schoolId
              ? [
                  [
                    child.id,
                    { id: child.id, name: `${child.first_name} ${child.last_name}`.trim() },
                  ] as const,
                ]
              : []
          )
        );
        return {
          id: row.id,
          name: `${row.first_name} ${row.last_name}`.trim(),
          email: row.email,
          phone: row.phone,
          status,
          inviteExpiresAt: row.auth_user_id ? null : (latest?.expires_at ?? null),
          children: [...children.values()].sort((a, b) => a.name.localeCompare(b.name)),
        };
      })
    );
    if (rows.length < size) return entries;
  }
}
