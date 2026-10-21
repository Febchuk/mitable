import type { SupabaseClient } from "@supabase/supabase-js";
import { dbToddlerDailyLogToDto, toddlerDailyLogReportText } from "@/lib/toddler-routines";
import { buildDefaultReportSections, type DefaultTemplateBuildResult } from "./default-template";
import { decodeProgressTopic } from "./progress-topic-payload";
import { plainTextToReportParagraphHtml } from "./template-field-payload";
import { toddlerDayOverview } from "./toddler-day-overview";

/** The school day is Africa/Lagos (UTC+1), regardless of the sender's device. */
export const TODDLER_DAY_UTC_OFFSET_MINUTES = -60;
export class ToddlerReportNotReadyError extends Error {}
export function toddlerReportDayWindow(date: string) {
  return {
    start: new Date(`${date}T00:00:00+01:00`).toISOString(),
    end: new Date(`${date}T23:59:59.999+01:00`).toISOString(),
  };
}

export async function buildToddlerDailyReportSections(
  db: SupabaseClient,
  args: {
    schoolId: string;
    classroomId: string;
    studentId: string;
    reportDate: string;
  }
): Promise<DefaultTemplateBuildResult & { toddlerDailyLogId: string | null }> {
  const [progress, logResult, attendanceResult] = await Promise.all([
    buildDefaultReportSections(db, {
      ...args,
      periodStart: args.reportDate,
      periodEnd: args.reportDate,
      reportingPeriod: "daily",
      exactWindow: toddlerReportDayWindow(args.reportDate),
    }),
    db
      .from("toddler_daily_logs")
      .select("*")
      .eq("school_id", args.schoolId)
      .eq("classroom_id", args.classroomId)
      .eq("student_id", args.studentId)
      .eq("log_date", args.reportDate)
      .maybeSingle(),
    db
      .from("attendance_records")
      .select("status, arrival_time")
      .eq("classroom_id", args.classroomId)
      .eq("student_id", args.studentId)
      .eq("attendance_date", args.reportDate)
      .maybeSingle(),
  ]);
  if (logResult.error) throw new Error(logResult.error.message);
  if (attendanceResult.error) throw new Error(attendanceResult.error.message);
  const log = logResult.data ? dbToddlerDailyLogToDto(logResult.data) : null;
  const rows = progress.sections.flatMap(
    (section) => decodeProgressTopic(section.paragraphs[0]?.html ?? "") ?? []
  );
  if (!log && !rows.length)
    throw new ToddlerReportNotReadyError(
      "Save a Daily Log or mark progress before preparing this report"
    );
  const overview = toddlerDayOverview(log, rows);
  const attendance = attendanceResult.data;
  const attendanceLabel = attendance?.status
    ? `${attendance.status}${attendance.arrival_time ? ` · arrived ${String(attendance.arrival_time).slice(0, 5)}` : ""}`
    : null;
  const logText = log ? toddlerDailyLogReportText(log, attendanceLabel) : "";
  const section = (id: string, heading: string, html: string) => ({
    id: `s-${id}`,
    heading,
    paragraphs: [{ id: `p-${id}`, html }],
  });
  return {
    ...progress,
    toddlerDailyLogId: log?.id ?? null,
    sections: [
      section(
        `toddler-overview-${args.reportDate}`,
        "Daily overview",
        plainTextToReportParagraphHtml(overview)
      ),
      ...(log
        ? [
            section(
              `toddler-daily-log-${args.reportDate}`,
              "Daily log",
              plainTextToReportParagraphHtml(logText)
            ),
          ]
        : []),
      ...progress.sections,
    ],
    sectionMeta: {
      ...progress.sectionMeta,
      "Daily overview": { type: "hardcoded" },
      ...(log ? { "Daily log": { type: "hardcoded" as const } } : {}),
    },
    sectionGuidance: {
      ...progress.sectionGuidance,
      "Daily overview": overview,
      ...(log ? { "Daily log": logText } : {}),
    },
  };
}
