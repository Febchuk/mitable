/**
 * Minimal Resend wrapper. Direct fetch — no SDK dependency.
 *
 * From address resolves in this order:
 *   1. RESEND_FROM env var (set this to "Mitable <noreply@mitable.ai>" once
 *      mitable.ai is verified in Resend)
 *   2. Resend's onboarding sender (`onboarding@resend.dev`) — works without
 *      domain verification but only delivers to the email address on your
 *      Resend account. Useful for local dev.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM = process.env.RESEND_FROM?.trim() || "Mitable <noreply@mitable.ai>";

export interface SendInviteInput {
  to: string;
  inviteUrl: string;
  schoolName: string;
  inviterName: string;
}

export interface SendResult {
  id: string;
}

export async function sendTeacherInviteEmail(input: SendInviteInput): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set; cannot dispatch invite email");
  }

  const subject = `${input.inviterName} invited you to ${input.schoolName} on Mitable`;
  const html = renderInviteHtml(input);
  const text = renderInviteText(input);

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [input.to],
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("Resend response missing id");
  return { id: json.id };
}

function renderInviteText({ inviteUrl, schoolName, inviterName }: SendInviteInput): string {
  return [
    `Hi,`,
    ``,
    `${inviterName} invited you to join ${schoolName} on Mitable — a calmer way to keep notes, track progress, and write reports for your students.`,
    ``,
    `Set up your account here:`,
    inviteUrl,
    ``,
    `This link is good for 14 days. If it expires, ask ${inviterName} to send you a new one.`,
    ``,
    `— The Mitable team`,
  ].join("\n");
}

function renderInviteHtml({ inviteUrl, schoolName, inviterName }: SendInviteInput): string {
  // Plain HTML, no template engine. Inline styles only — most email clients
  // strip <style> blocks. Warm cream background to match the app.
  const safeSchool = escapeHtml(schoolName);
  const safeInviter = escapeHtml(inviterName);
  const safeUrl = escapeHtml(inviteUrl);

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#FBF7EF;font-family:Georgia, 'Iowan Old Style', serif;color:#2A2723;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7EF;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E8DFD0;border-radius:18px;padding:36px 32px;">
            <tr><td>
              <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8A8275;margin-bottom:14px;">An invitation to teach</div>
              <h1 style="font-size:22px;font-weight:600;line-height:1.25;margin:0 0 14px;color:#2A2723;letter-spacing:-0.005em;">
                ${safeInviter} invited you to ${safeSchool}
              </h1>
              <p style="font-size:15px;line-height:1.55;color:#4A453E;margin:0 0 22px;">
                Mitable is a calm place to keep notes, track each child's progress, and turn it into thoughtful reports for parents.
                Set up your account to join the classroom.
              </p>
              <p style="margin:0 0 26px;">
                <a href="${safeUrl}"
                   style="display:inline-block;background:#2A2723;color:#FFFBF3;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px;letter-spacing:0.01em;">
                  Set up your account
                </a>
              </p>
              <p style="font-size:13px;line-height:1.5;color:#8A8275;margin:0 0 4px;">
                Or paste this link into your browser:
              </p>
              <p style="font-size:12px;line-height:1.5;color:#4A453E;word-break:break-all;margin:0 0 22px;">
                ${safeUrl}
              </p>
              <hr style="border:none;border-top:1px solid #E8DFD0;margin:22px 0 18px;" />
              <p style="font-size:12px;line-height:1.5;color:#8A8275;margin:0;">
                This link works for 14 days. If it's expired, ask ${safeInviter} to send a new one.
                Didn't expect this email? You can safely ignore it.
              </p>
            </td></tr>
          </table>
          <p style="font-size:11px;color:#8A8275;margin:18px 0 0;letter-spacing:0.04em;">Mitable · noreply@mitable.ai</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/* ------------------------------------------------------------------ */
/*  Report delivery email (sent to guardians / parents)               */
/* ------------------------------------------------------------------ */

import type { EmailJob, EmailSender } from "@/lib/admin/email-worker";
import { generateReportPdf } from "@/lib/pdf/generate-report-pdf";

export class ResendEmailSender implements EmailSender {
  async send(job: EmailJob): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "RESEND_API_KEY is not set" };
    }
    if (!job.email) {
      return { ok: false, error: "No email address for guardian" };
    }

    const studentName = job.studentName ?? "Student";
    const reportType = capitalizeReportType(job.reportType ?? "daily");
    const dateLabel = job.reportDate
      ? formatEmailDate(job.reportDate)
      : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const subject = `${reportType} Report for ${studentName} — ${dateLabel}`;

    let pdfAttachment: { content: string; filename: string } | undefined;
    try {
      const { buffer, filename } = await generateReportPdf({
        title: job.reportTitle ?? `${reportType} Report`,
        studentName,
        reportDate: job.reportDate,
        classroom: "",
        reportType: job.reportType ?? "daily",
        sections: job.reportSections ?? [],
        body: job.reportBody,
      });
      pdfAttachment = {
        content: buffer.toString("base64"),
        filename,
      };
    } catch (err) {
      console.warn("[ResendEmailSender] PDF generation failed, sending without attachment:", err);
    }

    const html = renderReportEmailHtml({
      studentName,
      reportType,
      dateLabel,
      messageBody: job.messageBody,
    });
    const text = renderReportEmailText({
      studentName,
      reportType,
      dateLabel,
      messageBody: job.messageBody,
    });

    try {
      const payload: Record<string, unknown> = {
        from: FROM,
        to: [job.email],
        subject,
        html,
        text,
      };
      if (pdfAttachment) {
        payload.attachments = [pdfAttachment];
      }

      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text();
        return { ok: false, error: `Resend ${res.status}: ${body}` };
      }

      const json = (await res.json()) as { id?: string };
      return { ok: true, messageId: json.id ?? undefined };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}

function capitalizeReportType(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function formatEmailDate(raw: string): string {
  try {
    const d = new Date(raw);
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return raw;
  }
}

interface EmailRenderInput {
  studentName: string;
  reportType: string;
  dateLabel: string;
  messageBody: string | null;
}

function renderReportEmailText(input: EmailRenderInput): string {
  const { studentName, reportType, dateLabel, messageBody } = input;
  const lines = [`${reportType} Report for ${studentName}`, dateLabel, ""];
  if (messageBody?.trim()) {
    lines.push(messageBody.trim(), "");
  }
  lines.push(
    "The full report is attached to this email as a PDF.",
    "",
    "—",
    "Sent by your child's school via Mitable.",
    "Questions? Please reach out to the school directly."
  );
  return lines.join("\n");
}

function renderReportEmailHtml(input: EmailRenderInput): string {
  const { studentName, reportType, dateLabel, messageBody } = input;
  const safeName = escapeHtml(studentName);
  const safeType = escapeHtml(reportType);
  const safeDate = escapeHtml(dateLabel);

  const hasMessage = !!messageBody?.trim();
  const messageHtml = hasMessage
    ? messageBody!
        .trim()
        .split(/\n{2,}/)
        .map(
          (p) =>
            `<p style="font-size:15px;line-height:1.65;color:#4A453E;margin:0 0 12px;">${escapeHtml(p.trim())}</p>`
        )
        .join("\n")
    : "";

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F5F1EA;font-family:Georgia,'Iowan Old Style','Palatino Linotype',serif;color:#2A2723;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1EA;">
    <tr><td style="padding:48px 20px 32px;" align="center">

      <!-- Card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(42,39,35,0.06);">

        <!-- Accent stripe -->
        <tr><td style="height:4px;background:#82C0CC;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Header -->
        <tr><td style="padding:32px 36px 0;">
          <p style="margin:0 0 4px;font-size:26px;font-weight:700;line-height:1.2;color:#2A2723;letter-spacing:-0.02em;">
            ${safeName}
          </p>
          <p style="margin:0;font-size:13px;color:#8A8275;line-height:1.5;">
            ${safeType} Report &nbsp;&middot;&nbsp; ${safeDate}
          </p>
        </td></tr>

        <!-- Divider -->
        <tr><td style="padding:20px 36px 0;">
          <hr style="border:none;border-top:1px solid #E8DFD0;margin:0;" />
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:20px 36px 0;">
          ${
            hasMessage
              ? `
          ${messageHtml}
          <p style="font-size:14px;line-height:1.6;color:#6B665C;margin:16px 0 0;font-style:italic;">
            The full report is attached as a PDF.
          </p>
          `
              : `
          <p style="font-size:15px;line-height:1.65;color:#4A453E;margin:0;">
            A new report for ${safeName} is ready for you. Please find it attached to this email as a PDF.
          </p>
          `
          }
        </td></tr>

        <!-- Footer divider -->
        <tr><td style="padding:24px 36px 0;">
          <hr style="border:none;border-top:1px solid #E8DFD0;margin:0;" />
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 36px 28px;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#A09A8E;">
            Sent by your child&rsquo;s school via Mitable.<br/>
            Questions? Please reach out to the school directly.
          </p>
        </td></tr>

      </table>
      <!-- /Card -->

      <p style="margin:20px 0 0;font-size:11px;color:#A09A8E;letter-spacing:0.04em;text-align:center;">
        Mitable
      </p>

    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
