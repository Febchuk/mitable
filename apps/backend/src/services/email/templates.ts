/**
 * Email Templates — Branded HTML for transactional emails
 *
 * All templates share a consistent dark-themed design matching the Mitable app.
 * Inline styles only (email client compatibility).
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Shared wrapper for all email templates */
function wrapInLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mitable</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#171717;border:1px solid #262626;border-radius:12px;overflow:hidden;">
          <!-- Logo -->
          <tr>
            <td style="padding:32px 32px 0 32px;">
              <span style="font-size:20px;font-weight:700;color:#6366f1;letter-spacing:-0.5px;">Mitable</span>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:24px 32px 32px 32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #262626;">
              <p style="margin:0;font-size:12px;color:#737373;line-height:1.5;">
                This is an automated message from Mitable. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Primary CTA button */
function ctaButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background:#6366f1;border-radius:8px;padding:12px 28px;">
      <a href="${escapeHtml(url)}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:inline-block;">${escapeHtml(text)}</a>
    </td>
  </tr>
</table>`;
}

// ─── Template Builders ───────────────────────────────────────────────────────

export function buildWelcomeAdminEmail(params: {
  firstName: string;
  organizationName: string;
}): string {
  return wrapInLayout(`
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:600;color:#ffffff;">Welcome to Mitable</h1>
    <p style="margin:0 0 20px 0;font-size:14px;color:#a3a3a3;line-height:1.6;">
      Hi ${escapeHtml(params.firstName)}, your organization <strong style="color:#e5e5e5;">${escapeHtml(params.organizationName)}</strong> is all set up and ready to go.
    </p>
    <p style="margin:0 0 12px 0;font-size:14px;color:#a3a3a3;line-height:1.6;">
      As the admin, you can:
    </p>
    <ul style="margin:0 0 20px 0;padding-left:20px;font-size:14px;color:#a3a3a3;line-height:1.8;">
      <li>Add team members from the People tab</li>
      <li>Configure integrations (Slack, Linear, Notion)</li>
      <li>Review session recaps and generated docs</li>
    </ul>
    <p style="margin:0;font-size:14px;color:#a3a3a3;line-height:1.6;">
      Open the Mitable desktop app to start your first session. If you haven't installed it yet, download it from your dashboard.
    </p>
  `);
}

export function buildWelcomeEmployeeEmail(params: {
  email: string;
  firstName: string;
  organizationName: string;
  temporaryPassword: string;
  loginUrl: string;
}): string {
  return wrapInLayout(`
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:600;color:#ffffff;">You're in!</h1>
    <p style="margin:0 0 20px 0;font-size:14px;color:#a3a3a3;line-height:1.6;">
      Hi ${escapeHtml(params.firstName)}, you've been added to <strong style="color:#e5e5e5;">${escapeHtml(params.organizationName)}</strong> on Mitable.
    </p>
    <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#d4d4d4;text-transform:uppercase;letter-spacing:0.5px;">Your login credentials</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#0a0a0a;border:1px solid #333333;border-radius:8px;margin-bottom:20px;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px 0;font-size:13px;color:#737373;">Email</p>
          <p style="margin:0 0 16px 0;font-size:14px;color:#ffffff;font-family:monospace;">${escapeHtml(params.email)}</p>
          <p style="margin:0 0 8px 0;font-size:13px;color:#737373;">Temporary Password</p>
          <p style="margin:0;font-size:14px;color:#ffffff;font-family:monospace;background:#1a1a2e;padding:8px 12px;border-radius:6px;border:1px solid #333333;">${escapeHtml(params.temporaryPassword)}</p>
        </td>
      </tr>
    </table>
    ${ctaButton("Sign In to Mitable", params.loginUrl)}
    <p style="margin:0;font-size:13px;color:#737373;line-height:1.5;">
      We recommend changing your password after your first login. Go to <strong style="color:#a3a3a3;">Settings → Security</strong> to update it.
    </p>
  `);
}

export function buildPasswordResetEmail(params: {
  firstName: string;
  resetUrl: string;
}): string {
  return wrapInLayout(`
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:600;color:#ffffff;">Reset your password</h1>
    <p style="margin:0 0 20px 0;font-size:14px;color:#a3a3a3;line-height:1.6;">
      Hi ${escapeHtml(params.firstName)}, we received a request to reset your Mitable password. Click the button below to set a new one.
    </p>
    ${ctaButton("Reset Password", params.resetUrl)}
    <p style="margin:0 0 8px 0;font-size:13px;color:#737373;line-height:1.5;">
      This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.
    </p>
    <p style="margin:0;font-size:13px;color:#737373;line-height:1.5;">
      If the button doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin:8px 0 0 0;font-size:12px;color:#6366f1;word-break:break-all;">
      <a href="${escapeHtml(params.resetUrl)}" style="color:#6366f1;text-decoration:underline;">${escapeHtml(params.resetUrl)}</a>
    </p>
  `);
}

export function buildPasswordChangedEmail(params: {
  firstName: string;
}): string {
  return wrapInLayout(`
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:600;color:#ffffff;">Password changed</h1>
    <p style="margin:0 0 20px 0;font-size:14px;color:#a3a3a3;line-height:1.6;">
      Hi ${escapeHtml(params.firstName)}, your Mitable password was successfully updated.
    </p>
    <p style="margin:0;font-size:14px;color:#a3a3a3;line-height:1.6;">
      If you didn't make this change, please reset your password immediately or contact your organization admin.
    </p>
  `);
}
