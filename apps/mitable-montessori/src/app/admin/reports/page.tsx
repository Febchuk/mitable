import { redirect } from "next/navigation";
import { Suspense } from "react";
import { listReportsV2 } from "@/lib/queries/reports";
import { ReportsListView } from "@/app/app/reports/reports-list-view";

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

  const reports = await listReportsV2();

  if (openParam && reports.some((r) => r.id === openParam)) {
    redirect(`/admin/reports/${openParam}`);
  }

  return (
    <Suspense fallback={null}>
      <ReportsListView reports={reports} variant="admin" />
    </Suspense>
  );
}
