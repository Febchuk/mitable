import { notFound } from "next/navigation";
import { featureFlags } from "@/lib/feature-flags";
import { getReport, listReportsV2 } from "@/lib/queries/reports";
import { ReportsV2Shell } from "@/components/reports-v2/reports-shell";
import { adaptReportListRow } from "@/components/reports-v2/adapt";
import { mockReports } from "@/components/reports-v2/mock-data";

export default async function AdminReportsV2Page({
  searchParams,
}: {
  searchParams: Promise<{ open?: string | string[] }>;
}) {
  if (!featureFlags.reportsV2()) notFound();

  const sp = await searchParams;
  const rawOpen = sp?.open;
  const openParam =
    typeof rawOpen === "string" ? rawOpen : Array.isArray(rawOpen) ? rawOpen[0] : undefined;

  // Admin sees all reports across the school (no classroom filter).
  const rows = await listReportsV2();
  const reports = rows.length > 0 ? rows.map((r) => adaptReportListRow(r)) : mockReports;

  const initialSelectedId = openParam && reports.some((r) => r.id === openParam) ? openParam : null;
  const detail = initialSelectedId ? await getReport(initialSelectedId) : null;

  return (
    <ReportsV2Shell
      reports={reports}
      variant="admin"
      initialSelectedId={initialSelectedId}
      selectedSections={detail?.sections ?? null}
    />
  );
}
