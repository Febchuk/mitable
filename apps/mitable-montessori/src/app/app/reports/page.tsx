import { listReports } from "@/lib/queries/reports";
import { ReportsListView } from "./reports-list-view";

export default async function ReportsPage() {
  const reports = await listReports();
  return <ReportsListView reports={reports} />;
}
