import { listReports } from "@/lib/queries/reports";
import { ReportsListView } from "@/app/app/reports/reports-list-view";

export default async function AdminReportsPage() {
  const reports = await listReports();
  return <ReportsListView reports={reports} variant="admin" />;
}
