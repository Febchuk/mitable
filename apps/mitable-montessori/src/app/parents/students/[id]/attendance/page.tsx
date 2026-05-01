import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export default async function AttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/parents/login");

  const { data: rows } = await supabase
    .from("attendance_records")
    .select("attendance_date, status, comment")
    .eq("student_id", id)
    .order("attendance_date", { ascending: false })
    .limit(60);

  const list = (rows ?? []) as Array<{
    attendance_date: string;
    status: "present" | "absent";
    comment: string | null;
  }>;

  return (
    <div className="space-y-4 py-4">
      <h2 className="font-display text-xl">Attendance</h2>
      {list.length === 0 ? (
        <p className="text-sm text-ink/50">No records yet.</p>
      ) : (
        <ul className="divide-y divide-ink/5 rounded-lg border border-ink/10">
          {list.map((r) => (
            <li
              key={r.attendance_date}
              className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
            >
              <span className="font-mono text-xs text-ink/60">{r.attendance_date}</span>
              <span
                className={
                  r.status === "present"
                    ? "rounded-full bg-sage/15 px-2 py-0.5 text-xs text-sage"
                    : "rounded-full bg-terracotta/15 px-2 py-0.5 text-xs text-terracotta"
                }
              >
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
