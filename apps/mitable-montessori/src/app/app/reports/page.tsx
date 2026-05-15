import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentUserContext } from "@/lib/app/active-classroom";
import { listReportsV2 } from "@/lib/queries/reports";
import { ReportsRailView } from "./reports-rail-view";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string | string[] }>;
}) {
  const ctx = await getCurrentUserContext();
  const sp = await searchParams;
  const rawOpen = sp?.open;
  const openParam =
    typeof rawOpen === "string" ? rawOpen : Array.isArray(rawOpen) ? rawOpen[0] : undefined;

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

  const reports = await listReportsV2({ classroomIds });
  const initialOpenReportId =
    openParam && reports.some((r) => r.id === openParam) ? openParam : null;
  return <ReportsRailView reports={reports} initialOpenReportId={initialOpenReportId} />;
}
