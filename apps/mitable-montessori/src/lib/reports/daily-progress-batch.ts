export type DailyProgressReportStatus =
  | "draft"
  | "submitted_for_review"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "sent";

export type DailyProgressReportChild = {
  studentId: string;
  studentName: string;
  classroomId: string;
  classroomName: string;
  progressCount: number;
  noteCount: number;
  guardianCount: number;
  reportId: string | null;
  reportStatus: DailyProgressReportStatus | null;
  sendable: boolean;
  reason: "ready" | "no_progress" | "no_guardian" | "in_review" | "sent";
};

export type DailyProgressReportClassroom = {
  classroomId: string;
  classroomName: string;
  children: DailyProgressReportChild[];
};

export type DailyProgressReportSummary = {
  reportDate: string;
  classrooms: DailyProgressReportClassroom[];
  readyCount: number;
  sentCount: number;
};

export type DailyProgressBatchResult = {
  studentId: string;
  studentName: string;
  reportId?: string;
  status: "sent" | "skipped" | "failed";
  error?: string;
};

export function dailyProgressReason(args: {
  progressCount: number;
  guardianCount: number;
  reportStatus: DailyProgressReportStatus | null;
}): Pick<DailyProgressReportChild, "sendable" | "reason"> {
  if (args.reportStatus === "sent") return { sendable: false, reason: "sent" };
  if (args.reportStatus === "submitted_for_review" || args.reportStatus === "in_review") {
    return { sendable: false, reason: "in_review" };
  }
  if (args.progressCount === 0) return { sendable: false, reason: "no_progress" };
  if (args.guardianCount === 0) return { sendable: false, reason: "no_guardian" };
  return { sendable: true, reason: "ready" };
}
