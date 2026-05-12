import { notFound } from "next/navigation";
import { featureFlags } from "@/lib/feature-flags";
import { ReportsV2Shell } from "@/components/reports-v2/reports-shell";
import { mockReports } from "@/components/reports-v2/mock-data";

export default async function AdminReportsV2Page() {
  if (!featureFlags.reportsV2()) notFound();
  return <ReportsV2Shell reports={mockReports} variant="admin" />;
}
