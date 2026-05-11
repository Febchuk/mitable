import { listReports } from "@/lib/queries/reports";
import { ReportsRailView } from "@/app/app/reports/reports-rail-view";

// Future split-view workspace UI archived at ./PHASE_8_FUTURE_WORKSPACE.md
// (originally Phase 8 commit 49505b8f, dropped during the Supabase migration).

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawOpen = sp?.open;
  const openParam =
    typeof rawOpen === "string" ? rawOpen : Array.isArray(rawOpen) ? rawOpen[0] : undefined;

  const reports = await listReports();
  const initialOpenReportId =
    openParam && reports.some((r) => r.id === openParam) ? openParam : null;
  return (
    <ReportsRailView reports={reports} variant="admin" initialOpenReportId={initialOpenReportId} />
  );
}
