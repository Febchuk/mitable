import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getParentPortalContext, selectedParentChild } from "@/lib/parents/portal";
import { createClient } from "@/utils/supabase/server";

export default async function ParentReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<{ child?: string }>;
}) {
  const portal = await getParentPortalContext();
  if (!portal) redirect("/parents/login");
  const child = selectedParentChild(portal.children, (await searchParams).child);
  if (!child) notFound();
  const { reportId } = await params;

  const supabase = createClient(await cookies());
  const { data: report } = await supabase
    .from("reports")
    .select("id, report_type, period_start, period_end, title, body, sent_at")
    .eq("id", reportId)
    .eq("student_id", child.id)
    .eq("status", "sent")
    .maybeSingle();
  if (!report) notFound();

  return (
    <article className="mx-auto max-w-3xl">
      <Link href={`/parents/reports?child=${child.id}`} className="text-sm text-ink-secondary">
        ← All reports
      </Link>
      <header className="mt-6 border-b border-border pb-6">
        <p className="label-cap text-ink-muted">
          {report.report_type} report · {child.name}
        </p>
        <h1 className="mt-2 font-display text-4xl text-ink">{report.title || "Report"}</h1>
        <p className="mt-3 text-sm text-ink-secondary">
          {report.period_start && report.period_end
            ? `${report.period_start} – ${report.period_end}`
            : report.sent_at
              ? `Shared ${new Date(report.sent_at).toLocaleDateString()}`
              : "Shared with your family"}
        </p>
      </header>
      <div className="mt-8 whitespace-pre-wrap text-[15px] leading-7 text-ink-secondary">
        {report.body || "This report does not include written notes."}
      </div>
    </article>
  );
}
