import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentUserContext } from "@/lib/app/active-classroom";
import { featureFlags } from "@/lib/feature-flags";
import { getReport, listReportsV2 } from "@/lib/queries/reports";
import { ReportsV2Shell } from "@/components/reports-v2/reports-shell";
import { adaptReportListRow } from "@/components/reports-v2/adapt";
import { mockReports } from "@/components/reports-v2/mock-data";

export default async function ReportsV2Page({
  searchParams,
}: {
  searchParams: Promise<{ open?: string | string[] }>;
}) {
  if (!featureFlags.reportsV2()) notFound();

  const ctx = await getCurrentUserContext();
  const sp = await searchParams;
  const rawOpen = sp?.open;
  const openParam =
    typeof rawOpen === "string" ? rawOpen : Array.isArray(rawOpen) ? rawOpen[0] : undefined;

  // Constrain teacher view to their classrooms (matches the prod /app/reports
  // behavior in apps/mitable-montessori/src/app/app/reports/page.tsx).
  let classroomIds: string[] | undefined;
  if (ctx) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("classroom_teacher_assignments")
      .select("classroom_id")
      .eq("teacher_user_id", ctx.userId)
      .is("end_date", null);
    const ids = (data ?? []).map((r) => r.classroom_id as string).filter(Boolean);
    if (ids.length > 0) classroomIds = ids;
  }

  const rows = await listReportsV2({ classroomIds });

  // Fallback to fixtures for empty schools so the demo route still works.
  // Once real schools have content this branch is dead.
  const reports = rows.length > 0 ? rows.map((r) => adaptReportListRow(r)) : mockReports;

  // Resolve initial selection + its body server-side so the first render
  // shows real content (no client-side spinner round-trip).
  const initialSelectedId = openParam && reports.some((r) => r.id === openParam) ? openParam : null;
  const detail = initialSelectedId ? await getReport(initialSelectedId) : null;

  return (
    <ReportsV2Shell
      reports={reports}
      variant="teacher"
      initialSelectedId={initialSelectedId}
      selectedSections={detail?.sections ?? null}
      currentUserId={ctx?.userId ?? null}
    />
  );
}
