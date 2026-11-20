import type { SupabaseClient } from "@supabase/supabase-js";

export interface EmailJob {
  recipientId: string;
  reportId: string;
  studentId: string;
  guardianId: string;
  email: string | null;
  reportDate: string | null;
  studentName: string | null;
  schoolName: string | null;
  reportType: string | null;
  messageBody: string | null;
}
export interface EmailSender {
  send(job: EmailJob): Promise<{ ok: boolean; messageId?: string; error?: string }>;
}
export interface DrainResult {
  attempted: number;
  sent: number;
  failed: number;
  pending: number;
  needsReview: number;
  failures: Array<{ recipientId: string; error: string }>;
}
type Snapshot = {
  status?: string;
  student_id?: string;
  report_date: string | null;
  report_type: string | null;
  school_name?: string | null;
  student_name?: string | null;
  students?:
    | {
        id: string;
        first_name: string;
        last_name: string;
        schools?: { name: string | null } | Array<{ name: string | null }> | null;
      }
    | Array<{
        id: string;
        first_name: string;
        last_name: string;
        schools?: { name: string | null } | Array<{ name: string | null }> | null;
      }>
    | null;
};
type Recipient = {
  id: string;
  report_id: string;
  guardian_id: string;
  email_snapshot: string | null;
  message_body: string | null;
  delivery_status: string;
  attempts: number;
  first_attempt_at: string | null;
  claimed_at: string | null;
  report_publications: { snapshot: Snapshot } | null;
  reports: Snapshot | Snapshot[] | null;
};

/** Deliver only explicitly queued publications. Atomic claims and provider keys protect retries. */
export async function drainPendingReports(
  db: SupabaseClient,
  sender: EmailSender,
  options: { limit?: number; reportId?: string } = {}
): Promise<DrainResult> {
  let query = db
    .from("report_recipients")
    .select(
      "id, report_id, guardian_id, email_snapshot, message_body, delivery_status, attempts, first_attempt_at, claimed_at, report_publications(snapshot), reports(status, report_date, report_type, students(id, first_name, last_name, schools(name)))"
    )
    .in("delivery_status", ["pending", "failed", "sending", "needs_review"])
    .limit(options.limit ?? 50);
  if (options.reportId) query = query.eq("report_id", options.reportId);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load pending recipients: ${error.message}`);
  const result: DrainResult = {
    attempted: 0,
    sent: 0,
    failed: 0,
    pending: 0,
    needsReview: 0,
    failures: [],
  };
  for (const row of (data ?? []) as unknown as Recipient[]) {
    if (row.delivery_status === "needs_review") {
      result.needsReview++;
      continue;
    }
    const report =
      row.report_publications?.snapshot ??
      (Array.isArray(row.reports) ? row.reports[0] : row.reports);
    if (!report || (!row.report_publications && report.status !== "sent") || !row.email_snapshot) {
      const reason = !row.email_snapshot
        ? "missing guardian email"
        : "parent report not in 'sent' state";
      await db
        .from("report_recipients")
        .update({ delivery_status: "failed", last_error: reason })
        .eq("id", row.id);
      result.attempted++;
      result.failed++;
      result.failures.push({ recipientId: row.id, error: reason });
      continue;
    }
    const now = new Date();
    if (
      row.first_attempt_at &&
      now.getTime() - new Date(row.first_attempt_at).getTime() > 23 * 60 * 60 * 1000
    ) {
      await db
        .from("report_recipients")
        .update({
          delivery_status: "needs_review",
          last_error:
            "Check provider history before retrying; the duplicate-prevention window is closing.",
        })
        .eq("id", row.id)
        .eq("delivery_status", row.delivery_status);
      result.needsReview++;
      continue;
    }
    if (
      row.delivery_status === "sending" &&
      row.claimed_at &&
      now.getTime() - new Date(row.claimed_at).getTime() < 5 * 60 * 1000
    ) {
      result.pending++;
      continue;
    }
    const attempt = (row.attempts ?? 0) + 1;
    const { data: claimed, error: claimError } = await db
      .from("report_recipients")
      .update({
        delivery_status: "sending",
        claimed_at: now.toISOString(),
        first_attempt_at: row.first_attempt_at ?? now.toISOString(),
        attempts: attempt,
        last_error: null,
      })
      .eq("id", row.id)
      .eq("delivery_status", row.delivery_status)
      .eq("attempts", row.attempts ?? 0)
      .select("id")
      .maybeSingle();
    if (claimError) {
      result.failed++;
      result.failures.push({ recipientId: row.id, error: "Could not claim delivery" });
      continue;
    }
    if (!claimed) {
      result.pending++;
      continue;
    }
    result.attempted++;
    const student = Array.isArray(report.students) ? report.students[0] : report.students;
    const school = Array.isArray(student?.schools) ? student.schools[0] : student?.schools;
    try {
      const outcome = await sender.send({
        recipientId: row.id,
        reportId: row.report_id,
        guardianId: row.guardian_id,
        studentId: report.student_id ?? student?.id ?? "",
        email: row.email_snapshot,
        reportDate: report.report_date,
        studentName:
          report.student_name ?? (student ? `${student.first_name} ${student.last_name}` : null),
        schoolName: report.school_name ?? school?.name ?? null,
        reportType: report.report_type,
        messageBody: row.message_body,
      });
      if (!outcome.ok) throw new Error(outcome.error ?? "Email acceptance was not confirmed");
      const { error: saveError } = await db
        .from("report_recipients")
        .update({
          delivery_status: "sent",
          sent_at: new Date().toISOString(),
          provider_id: outcome.messageId ?? null,
          last_error: null,
        })
        .eq("id", row.id)
        .eq("delivery_status", "sending")
        .eq("attempts", attempt);
      // A crash or failed acknowledgement leaves the same recipient key for retry.
      if (saveError) result.pending++;
      else result.sent++;
    } catch (sendError) {
      const message =
        sendError instanceof Error ? sendError.message : "Email acceptance was not confirmed";
      await db
        .from("report_recipients")
        .update({ delivery_status: "failed", last_error: message.slice(0, 1000) })
        .eq("id", row.id)
        .eq("delivery_status", "sending")
        .eq("attempts", attempt);
      result.failed++;
      result.failures.push({ recipientId: row.id, error: message });
    }
  }
  return result;
}

export class StubEmailSender implements EmailSender {
  public sentJobs: EmailJob[] = [];
  async send(job: EmailJob) {
    this.sentJobs.push(job);
    return { ok: true, messageId: `stub-${this.sentJobs.length}` };
  }
}
