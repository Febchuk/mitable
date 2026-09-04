import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getParentPortalContext, selectedParentChild } from "@/lib/parents/portal";
import { createClient } from "@/utils/supabase/server";
import { ParentReportView } from "@/components/parents/parent-report-view";
import { buildReportPdfBlocks } from "@/lib/pdf/sections-to-pdf-sections";
import type { SectionMeta } from "@/lib/report-templates/sections";
import { createAdminClient } from "@/utils/supabase/admin";
import { listToddlerReportMedia } from "@/lib/media/report-media";

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
    .select(
      "id, report_type, period_start, period_end, title, body, sent_at, sections, section_meta, toddler_daily_log_id"
    )
    .eq("id", reportId)
    .eq("student_id", child.id)
    .eq("status", "sent")
    .maybeSingle();
  if (!report) notFound();
  const media = await listToddlerReportMedia(
    createAdminClient(),
    report.toddler_daily_log_id as string | null
  );

  const sections = Array.isArray(report.sections)
    ? (report.sections as Array<{ heading: string; paragraphs: Array<{ html: string }> }>)
    : [];
  const blocks = buildReportPdfBlocks(
    sections,
    (report.section_meta as SectionMeta | null) ?? null
  );
  const periodLabel =
    report.period_start && report.period_end
      ? `${report.period_start} – ${report.period_end}`
      : report.sent_at
        ? `Shared ${new Date(report.sent_at).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}`
        : "Shared with your family";

  return (
    <div>
      <Link href={`/parents/reports?child=${child.id}`} className="text-sm text-ink-secondary">
        ← All reports
      </Link>
      <div className="mt-5">
        <ParentReportView
          title={report.title || "Report"}
          studentName={child.name}
          reportType={report.report_type}
          periodLabel={periodLabel}
          blocks={blocks}
          fallbackBody={report.body || "This report does not include written notes."}
          media={media}
        />
      </div>
    </div>
  );
}
