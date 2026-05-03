import { notFound } from "next/navigation";
import { ReportDetail } from "@/components/montessori/report-detail";
import { findChild, findReport } from "@/components/montessori/data";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = findReport(id);
  if (!report) notFound();
  const child = findChild(report.childId);
  return <ReportDetail report={report} child={child} />;
}
