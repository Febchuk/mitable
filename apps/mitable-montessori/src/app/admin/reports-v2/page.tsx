import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentUserContext } from "@/lib/app/active-classroom";
import { featureFlags } from "@/lib/feature-flags";
import { getReport, listReportsV2 } from "@/lib/queries/reports";
import { ReportsV2Shell } from "@/components/reports-v2/reports-shell";
import { adaptReportListRow } from "@/components/reports-v2/adapt";
import { mockReports } from "@/components/reports-v2/mock-data";

export default async function AdminReportsV2Page({
  searchParams,
}: {
  searchParams: Promise<{ open?: string | string[]; classroom?: string | string[] }>;
}) {
  if (!featureFlags.reportsV2()) notFound();

  const sp = await searchParams;
  const rawOpen = sp?.open;
  const openParam =
    typeof rawOpen === "string" ? rawOpen : Array.isArray(rawOpen) ? rawOpen[0] : undefined;
  const rawClassroom = sp?.classroom;
  const classroomFilter =
    typeof rawClassroom === "string"
      ? rawClassroom
      : Array.isArray(rawClassroom)
        ? rawClassroom[0]
        : undefined;

  const ctx = await getCurrentUserContext();
  const supabase = createAdminClient();

  // Pull all classrooms in the school for the admin filter chip. Phase 5
  // adds search and grouping; today this is a flat list.
  let classrooms: { id: string; name: string | null }[] = [];
  if (ctx) {
    const { data } = await supabase
      .from("classrooms")
      .select("id, name")
      .eq("school_id", ctx.schoolId)
      .eq("status", "active")
      .order("name");
    classrooms = (data ?? []) as { id: string; name: string | null }[];
  }

  const rows = await listReportsV2(
    classroomFilter ? { classroomIds: [classroomFilter] } : undefined
  );
  const reports = rows.length > 0 ? rows.map((r) => adaptReportListRow(r)) : mockReports;

  const initialSelectedId = openParam && reports.some((r) => r.id === openParam) ? openParam : null;
  const detail = initialSelectedId ? await getReport(initialSelectedId) : null;

  return (
    <ReportsV2Shell
      reports={reports}
      variant="admin"
      initialSelectedId={initialSelectedId}
      selectedSections={detail?.sections ?? null}
      classrooms={classrooms}
      activeClassroomId={classroomFilter ?? null}
      currentUserId={ctx?.userId ?? null}
    />
  );
}
