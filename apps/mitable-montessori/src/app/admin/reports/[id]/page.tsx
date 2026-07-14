import { notFound } from "next/navigation";
import { getReport } from "@/lib/queries/reports";
import { ReportWorkspace } from "@/components/montessori/report-detail/report-workspace";

export default async function AdminReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) notFound();

  return <ReportWorkspace report={report} backHref="/admin/reports" variant="admin" />;
}
