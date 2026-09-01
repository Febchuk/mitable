import type { SupabaseClient } from "@supabase/supabase-js";

type GuardianRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  preferred_contact_method: "email" | "phone" | "either" | null;
  auth_user_id: string | null;
};

export type GuardianSearchResult = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  preferredContactMethod: "email" | "phone" | "either";
  accountActive: boolean;
};

export function mergeGuardianSearchResults(
  groups: GuardianRow[][],
  excludedIds: ReadonlySet<string>
): GuardianSearchResult[] {
  const matches = new Map<string, GuardianRow>();
  for (const group of groups) {
    for (const guardian of group) {
      if (!excludedIds.has(guardian.id)) matches.set(guardian.id, guardian);
    }
  }

  return [...matches.values()]
    .sort((a, b) =>
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
    )
    .slice(0, 10)
    .map((guardian) => ({
      id: guardian.id,
      firstName: guardian.first_name,
      lastName: guardian.last_name,
      email: guardian.email ?? "",
      phone: guardian.phone ?? "",
      preferredContactMethod: guardian.preferred_contact_method ?? "either",
      accountActive: Boolean(guardian.auth_user_id),
    }));
}

export async function searchGuardiansForSchool(
  supabase: SupabaseClient,
  schoolId: string,
  query: string,
  studentId?: string
): Promise<GuardianSearchResult[]> {
  const pattern = `%${query.trim()}%`;
  const columns = "id, first_name, last_name, email, phone, preferred_contact_method, auth_user_id";
  const searches = ["first_name", "last_name", "email"].map((column) =>
    supabase
      .from("guardians")
      .select(columns)
      .eq("school_id", schoolId)
      .ilike(column, pattern)
      .limit(10)
  );
  const linkQuery = studentId
    ? supabase.from("student_guardians").select("guardian_id").eq("student_id", studentId)
    : Promise.resolve({ data: [], error: null });

  const [first, last, email, links] = await Promise.all([...searches, linkQuery]);
  const error = first.error ?? last.error ?? email.error ?? links.error;
  if (error) throw error;

  const excludedIds = new Set(
    (links.data ?? []).map((row) => (row as { guardian_id: string }).guardian_id)
  );
  return mergeGuardianSearchResults(
    [
      (first.data ?? []) as GuardianRow[],
      (last.data ?? []) as GuardianRow[],
      (email.data ?? []) as GuardianRow[],
    ],
    excludedIds
  );
}
