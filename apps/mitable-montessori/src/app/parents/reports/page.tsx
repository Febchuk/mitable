import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getParentPortalContext, selectedParentChild } from "@/lib/parents/portal";
import { createClient } from "@/utils/supabase/server";

export default async function ParentReportsPage({
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
    .from("reports")
    .select("id, report_type, period_start, period_end, title, sent_at")
    .eq("student_id", child.id)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(50);
  const reports = (data ?? []) as Array<{
    id: string;
    report_type: "daily" | "major";
    period_start: string | null;
    period_end: string | null;
    title: string | null;
    sent_at: string | null;
  }>;

  return (
    <div className="max-w-3xl">
      <p className="label-cap text-ink-muted">{child.name}</p>
      <h1 className="mt-1 font-display text-3xl">Reports</h1>
      {reports.length === 0 ? (
        <p className="mt-7 text-sm text-ink-secondary">No reports have been sent to you yet.</p>
      ) : (
        <ul className="mt-7 space-y-3">
          {reports.map((report) => (
            <li key={report.id}>
              <Link
                href={`/parents/reports/${report.id}?child=${child.id}`}
                className="block rounded-2xl border border-border bg-surface p-5 no-underline transition-colors hover:bg-muted/50"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-base font-semibold text-ink">{report.title || "Report"}</h2>
                  <span className="label-cap shrink-0 text-ink-muted">{report.report_type}</span>
                </div>
                <p className="mt-2 text-sm text-ink-secondary">
                  {report.period_start && report.period_end
                    ? `${report.period_start} – ${report.period_end}`
                    : report.sent_at
                      ? `Shared ${new Date(report.sent_at).toLocaleDateString()}`
                      : "Shared with your family"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
