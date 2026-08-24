import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getParentPortalContext, selectedParentChild } from "@/lib/parents/portal";
import { createClient } from "@/utils/supabase/server";

function formatAttendanceDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export default async function ParentAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const portal = await getParentPortalContext();
  if (!portal) redirect("/parents/login");
  const child = selectedParentChild(portal.children, (await searchParams).child);
  if (!child) notFound();

  const supabase = createClient(await cookies());
  const { data } = await supabase
    .from("attendance_records")
    .select("attendance_date, status, comment")
    .eq("student_id", child.id)
    .order("attendance_date", { ascending: false })
    .limit(60);
  const rows = (data ?? []) as Array<{
    attendance_date: string;
    status: "present" | "absent";
    comment: string | null;
  }>;

  return (
    <div className="max-w-3xl">
      <p className="label-cap text-ink-muted">{child.name}</p>
      <h1 className="mt-1 font-display text-3xl">Attendance</h1>
      {rows.length === 0 ? (
        <p className="mt-7 text-sm text-ink-secondary">No attendance records yet.</p>
      ) : (
        <ul className="mt-7 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {rows.map((row) => (
            <li
              key={row.attendance_date}
              className="flex items-center justify-between gap-4 px-5 py-4"
            >
              <div>
                <p className="text-sm font-medium text-ink">
                  {formatAttendanceDate(row.attendance_date)}
                </p>
                {row.comment ? (
                  <p className="mt-1 text-sm text-ink-secondary">{row.comment}</p>
                ) : null}
              </div>
              <span
                className={
                  row.status === "present"
                    ? "rounded-full bg-sage-soft px-3 py-1 text-xs font-medium text-sage-deep"
                    : "rounded-full bg-terracotta-soft px-3 py-1 text-xs font-medium text-terracotta-deep"
                }
              >
                {row.status === "present" ? "Present" : "Absent"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
