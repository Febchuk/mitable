import type { SupabaseClient } from "@supabase/supabase-js";
import type { SectionMeta } from "@/lib/report-templates/sections";
import { isToddlerClassroomCode } from "@/lib/app/active-classroom";
import { buildToddlerDailyReportSections } from "./toddler-daily-report";
import type { DefaultTemplateBuildResult } from "./default-template";

export type DailyReportSnapshotSource = {
  student_id: string;
  classroom_id: string;
  report_date: string | null;
  period_end: string | null;
  sections: DefaultTemplateBuildResult["sections"] | null;
  section_meta: SectionMeta | null;
  section_guidance: Record<string, string> | null;
};

/** Return source fields for the same atomic write that marks a report sent. */
export async function toddlerSendSnapshot(db: SupabaseClient, report: DailyReportSnapshotSource) {
  const { data: room, error } = await db
    .from("classrooms")
    .select("code, school_id")
    .eq("id", report.classroom_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!isToddlerClassroomCode(room?.code)) return null;
  const reportDate = report.report_date ?? report.period_end;
  if (!reportDate) throw new Error("This daily report has no report date");
  const built = await buildToddlerDailyReportSections(db, {
    schoolId: room!.school_id,
    classroomId: report.classroom_id,
    studentId: report.student_id,
    reportDate,
  });
  const meta = report.section_meta ?? {};
  const isGenerated = (heading: string) =>
    ["daily log", "daily overview"].includes(heading.trim().toLowerCase()) ||
    meta[heading]?.type === "progress_topic";
  // Keep teacher-written additions while replacing only the generated source snapshot.
  const additions = (report.sections ?? []).filter((section) => !isGenerated(section.heading));
  return {
    sections: [...built.sections, ...additions],
    section_meta: {
      ...Object.fromEntries(Object.entries(meta).filter(([heading]) => !isGenerated(heading))),
      ...built.sectionMeta,
    },
    section_guidance: {
      ...Object.fromEntries(
        Object.entries(report.section_guidance ?? {}).filter(([heading]) => !isGenerated(heading))
      ),
      ...built.sectionGuidance,
    },
    toddler_daily_log_id: built.toddlerDailyLogId,
    body: null,
  };
}
