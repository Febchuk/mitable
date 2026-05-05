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
const FROM = process.env.RESEND_FROM?.trim() || "Mitable <onboarding@resend.dev>";

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
