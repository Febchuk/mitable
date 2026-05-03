import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export default async function ParentsHome() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/parents/login");

  const { data: link } = await supabase
    .from("guardians")
    .select("id, first_name, last_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!link) {
    return (
      <div className="space-y-3 py-12 text-center">
        <h1 className="font-display text-xl">No guardian profile linked</h1>
        <p className="text-sm text-ink/60">
          Your account isn&apos;t linked to a guardian record yet. Ask the school admin to send a
          fresh invitation.
        </p>
      </div>
    );
  }

  const { data: students } = await supabase
    .from("student_guardians")
    .select("receives_reports, students(id, first_name, last_name, preferred_name, archived_at)")
    .eq("guardian_id", (link as { id: string }).id);

  const visible =
    (students ?? [])
      .map((row) => {
        const r = row as {
          receives_reports: boolean;
          students:
            | {
                id: string;
                first_name: string;
                last_name: string;
                preferred_name: string | null;
                archived_at: string | null;
              }
            | {
                id: string;
                first_name: string;
                last_name: string;
                preferred_name: string | null;
                archived_at: string | null;
              }[]
            | null;
        };
        const s = Array.isArray(r.students) ? r.students[0] : r.students;
        if (!s || s.archived_at) return null;
        return { ...s, receivesReports: r.receives_reports };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null) ?? [];

  return (
    <div className="space-y-6 py-4">
      <h1 className="font-display text-2xl">Welcome back</h1>
      {visible.length === 0 ? (
        <p className="text-sm text-ink/60">
          No active students linked to your account yet. The school admin can update your link.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((s) => (
            <li key={s.id}>
              <Link
                href={`/parents/students/${s.id}`}
                className="block rounded-lg border border-ink/10 bg-canvas px-4 py-3 hover:bg-ink/5"
              >
                <p className="font-display text-lg">
                  {s.preferred_name || `${s.first_name} ${s.last_name}`}
                </p>
                {!s.receivesReports ? (
                  <p className="text-xs text-ink/40">Reports off — admin can re-enable</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
