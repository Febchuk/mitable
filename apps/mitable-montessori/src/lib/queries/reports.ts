import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export type ReportListRow = {
  id: string;
  studentId: string;
  studentName: string;
  classroomId: string;
  reportType: "daily" | "major" | "incident";
  reportDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  status:
    | "draft"
    | "submitted_for_review"
    | "in_review"
    | "changes_requested"
    | "approved"
    | "sent";
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReportSection = {
  id: string;
  heading: string;
  paragraphs: { id: string; html: string }[];
};

export type ReportDetail = ReportListRow & {
  body: string | null;
  sections: ReportSection[] | null;
  templateId: string | null;
  createdByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  sentAt: string | null;
};

type ReportsRow = {
  id: string;
  student_id: string;
  classroom_id: string;
  report_type: "daily" | "major" | "incident";
  report_date: string | null;
  period_start: string | null;
  period_end: string | null;
  status: ReportListRow["status"];
  title: string | null;
  body: string | null;
  sections: ReportSection[] | null;
  template_id: string | null;
  created_by_user_id: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  students: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    preferred_name: string | null;
  } | null;
};

function fullName(s: ReportsRow["students"]): string {
  if (!s) return "Unknown";
  const first = s.preferred_name || s.first_name || "";
  const last = s.last_name || "";
  return `${first} ${last}`.trim() || "Unknown";
}

/** All reports the caller can see (RLS-scoped). Most recent first. */
export async function listReports(): Promise<ReportListRow[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, student_id, classroom_id, report_type, report_date, period_start, period_end, status, title, created_at, updated_at, students(id, first_name, last_name, preferred_name)"
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listReports failed", error);
    return [];
  }
  return (data as unknown as ReportsRow[]).map((row) => ({
    id: row.id,
    studentId: row.student_id,
    studentName: fullName(row.students),
    classroomId: row.classroom_id,
    reportType: row.report_type,
    reportDate: row.report_date,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** Single-report read for the editor page. RLS-scoped. */
export async function getReport(id: string): Promise<ReportDetail | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, student_id, classroom_id, report_type, report_date, period_start, period_end, status, title, body, sections, template_id, created_by_user_id, approved_by_user_id, approved_at, sent_at, created_at, updated_at, students(id, first_name, last_name, preferred_name)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getReport failed", error);
    return null;
  }
  if (!data) return null;
  const row = data as unknown as ReportsRow;
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: fullName(row.students),
    classroomId: row.classroom_id,
    reportType: row.report_type,
    reportDate: row.report_date,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    title: row.title,
    body: row.body,
    sections: row.sections,
    templateId: row.template_id,
    createdByUserId: row.created_by_user_id,
    approvedByUserId: row.approved_by_user_id,
    approvedAt: row.approved_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
