import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentUserContext } from "@/lib/app/active-classroom";
import { listReports } from "@/lib/queries/reports";
import { ReportsRailView } from "./reports-rail-view";

export default async function ReportsPage() {
  const ctx = await getCurrentUserContext();

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

  const reports = await listReports({ classroomIds });
  return <ReportsRailView reports={reports} />;
}
