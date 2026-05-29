import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentUserContext } from "@/lib/app/active-classroom";
import { reportFirstExperience } from "@/lib/feature-flags";
import { listReportsV2 } from "@/lib/queries/reports";
import { ReportsLandingView } from "./reports-landing-view";
import { ReportsListView } from "./reports-list-view";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string | string[]; notice?: string }>;
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

  if (openParam && reports.some((r) => r.id === openParam)) {
    redirect(`/app/reports/${openParam}`);
  }

  const reportFirst = reportFirstExperience();

  return (
    <Suspense fallback={null}>
      {reportFirst ? (
        <ReportsLandingView reports={reports} />
      ) : (
        <ReportsListView reports={reports} variant="teacher" />
      )}
    </Suspense>
  );
}
