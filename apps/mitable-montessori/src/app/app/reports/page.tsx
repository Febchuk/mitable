import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getActiveClassroomForCurrentUser } from "@/lib/app/active-classroom";
import { reportFirstExperience } from "@/lib/feature-flags";
import { listReportsV2 } from "@/lib/queries/reports";
import { ReportsLandingView } from "./reports-landing-view";
import { ReportsListView } from "./reports-list-view";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string | string[]; notice?: string }>;
}) {
  const sp = await searchParams;
  const rawOpen = sp?.open;
  const openParam =
    typeof rawOpen === "string" ? rawOpen : Array.isArray(rawOpen) ? rawOpen[0] : undefined;

  const [reports, classroom] = await Promise.all([
    listReportsV2(),
    getActiveClassroomForCurrentUser(),
  ]);
  const classroomName = classroom?.name?.trim() || null;

  if (openParam && reports.some((r) => r.id === openParam)) {
    redirect(`/app/reports/${openParam}`);
  }

  const reportFirst = reportFirstExperience();

  return (
    <Suspense fallback={null}>
      {reportFirst ? (
        <ReportsLandingView reports={reports} classroomName={classroomName} />
      ) : (
        <ReportsListView reports={reports} variant="teacher" classroomName={classroomName} />
      )}
    </Suspense>
  );
}
