import { notFound } from "next/navigation";
import { ReportDetail } from "@/components/montessori/report-detail";
import { getReport } from "@/lib/queries/reports";

// Status (draft / awaiting review / approved / sent) changes frequently and
// stale views are confusing — always render fresh on the server.
export const dynamic = "force-dynamic";

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) notFound();
  return <ReportDetail report={report} backToReportsHref="/admin/reports" isAdmin />;
}
