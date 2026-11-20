import { loadPublishedReport } from "@/lib/parents/published-reports";
import { ReportAccessHelp } from "@/components/parents/report-access-help";
import Link from "next/link";
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
  const { reportId } = await params;
  const requestedChild = (await searchParams).child;
  const destination = `/parents/reports/${encodeURIComponent(reportId)}${requestedChild ? `?child=${encodeURIComponent(requestedChild)}` : ""}`;
  const portal = await getParentPortalContext();
  if (!portal) return <ReportAccessHelp destination={destination} />;
  const supabase = createClient(await cookies());
  const report = await loadPublishedReport(supabase, reportId);
  if (!report) return <ReportAccessHelp destination={destination} />;
  const child = selectedParentChild(portal.children, requestedChild ?? report.student_id);
  if (!child || child.id !== report.student_id)
    return <ReportAccessHelp destination={destination} />;
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
          schoolName={report.school_name ?? portal.schoolName}
          logoUrl={report.template_logo_url}
        />
      </div>
    </div>
  );
}
