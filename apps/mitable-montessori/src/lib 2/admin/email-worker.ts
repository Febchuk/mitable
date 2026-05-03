import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Email delivery worker. Drains report_recipients rows in 'pending' →
 * 'sent' / 'failed'. Invoked by a cron (Phase 4 Week 12) and by an admin
 * "retry sends" button. The actual email send is plugged in via the `sender`
 * argument so production uses Resend / Postmark / etc., and tests use a
 * deterministic stub that never hits the network.
 */

export interface EmailJob {
  recipientId: string;
  reportId: string;
  guardianId: string;
  email: string | null;
  reportTitle: string | null;
  reportBody: string | null;
}

export interface EmailSender {
  send(job: EmailJob): Promise<{ ok: boolean; messageId?: string; error?: string }>;
}

export interface DrainResult {
  attempted: number;
  sent: number;
  failed: number;
  failures: Array<{ recipientId: string; error: string }>;
}

export async function drainPendingReports(
  supabase: SupabaseClient,
  sender: EmailSender,
  options: { limit?: number } = {}
): Promise<DrainResult> {
  const limit = options.limit ?? 50;

  const { data: rows, error } = await supabase
    .from("report_recipients")
    .select("id, report_id, guardian_id, email_snapshot, reports(title, body, status)")
    .eq("delivery_status", "pending")
    .limit(limit);
  if (error) {
    throw new Error(`Failed to load pending recipients: ${error.message}`);
  }

  const result: DrainResult = { attempted: 0, sent: 0, failed: 0, failures: [] };

  for (const r of rows ?? []) {
    const row = r as {
      id: string;
      report_id: string;
      guardian_id: string;
      email_snapshot: string | null;
      reports:
        | { title: string | null; body: string | null; status: string }
        | { title: string | null; body: string | null; status: string }[]
        | null;
    };
    const report = Array.isArray(row.reports) ? row.reports[0] : row.reports;
    result.attempted++;

    // Defense-in-depth: never deliver if the parent report isn't 'sent'.
    if (!report || report.status !== "sent") {
      await supabase
        .from("report_recipients")
        .update({ delivery_status: "failed" })
        .eq("id", row.id);
      result.failed++;
      result.failures.push({ recipientId: row.id, error: "parent report not in 'sent' state" });
      continue;
    }

    if (!row.email_snapshot) {
      await supabase
        .from("report_recipients")
        .update({ delivery_status: "failed" })
        .eq("id", row.id);
      result.failed++;
      result.failures.push({ recipientId: row.id, error: "missing guardian email" });
      continue;
    }

    const sendResult = await sender.send({
      recipientId: row.id,
      reportId: row.report_id,
      guardianId: row.guardian_id,
      email: row.email_snapshot,
      reportTitle: report.title,
      reportBody: report.body,
    });

    if (sendResult.ok) {
      await supabase
        .from("report_recipients")
        .update({ delivery_status: "sent", sent_at: new Date().toISOString() })
        .eq("id", row.id);
      result.sent++;
    } else {
      await supabase
        .from("report_recipients")
        .update({ delivery_status: "failed" })
        .eq("id", row.id);
      result.failed++;
      result.failures.push({
        recipientId: row.id,
        error: sendResult.error ?? "unknown send failure",
      });
    }
  }

  return result;
}

/** No-op sender used in tests + dev to avoid burning email quota. */
export class StubEmailSender implements EmailSender {
  public sentJobs: EmailJob[] = [];
  async send(job: EmailJob) {
    this.sentJobs.push(job);
    return { ok: true, messageId: `stub-${this.sentJobs.length}` };
  }
}
