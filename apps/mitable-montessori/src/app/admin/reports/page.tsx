import { listReports } from "@/lib/queries/reports";
import { ReportsRailView } from "@/app/app/reports/reports-rail-view";

// Future split-view workspace UI archived at ./PHASE_8_FUTURE_WORKSPACE.md
// (originally Phase 8 commit 49505b8f, dropped during the Supabase migration).

export default async function AdminReportsPage() {
  const reports = await listReports();
  return <ReportsRailView reports={reports} variant="admin" />;
}
