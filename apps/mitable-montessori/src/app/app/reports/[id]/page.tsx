import { notFound } from "next/navigation";
import { ReportDetail } from "@/components/montessori/report-detail";
import { getReport } from "@/lib/queries/reports";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) notFound();
  return <ReportDetail report={report} />;
}
