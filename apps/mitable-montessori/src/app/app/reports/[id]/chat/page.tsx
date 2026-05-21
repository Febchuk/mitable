import { notFound } from "next/navigation";
import { getReport } from "@/lib/queries/reports";
import { ReportDetail } from "@/components/montessori/report-detail";

/**
 * Mobile-only full-screen chat for a report. Desktop teachers use the
 * in-page upward drawer; the chat lives next to the report instead.
 */
export default async function TeacherReportChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) notFound();

  return (
    <ReportDetail
      report={report}
      backToReportsHref={`/app/reports/${id}`}
      hideBackLink
      chatMode="fullscreen"
    />
  );
}
