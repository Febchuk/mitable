/**
 * Email Service — Resend integration
 *
 * Sends transactional emails (welcome, password reset, confirmations)
 * via Resend. Gracefully degrades if API key is not configured.
 */

import { Resend } from "resend";
import { config } from "../../../config";
import { createLogger } from "../../shared-infra/lib/logger.js";
import {
  buildWelcomeAdminEmail,
  buildWelcomeEmployeeEmail,
  buildPasswordResetEmail,
  buildPasswordChangedEmail,
} from "./templates";

const logger = createLogger({ context: "email-service" });

const resend = config.resend.apiKey ? new Resend(config.resend.apiKey) : null;

if (!resend) {
  logger.warn("RESEND_API_KEY not set — email sending is disabled");
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

async function send(options: SendEmailOptions): Promise<boolean> {
  if (!resend) {
    logger.warn(
      { to: options.to, subject: options.subject },
      "Email skipped (Resend not configured)"
    );
    return false;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: config.resend.fromAddress,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      logger.error({ error, to: options.to, subject: options.subject }, "Resend API error");
      return false;
    }

    logger.info({ emailId: data?.id, to: options.to, subject: options.subject }, "Email sent");
    return true;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), to: options.to },
      "Failed to send email"
    );
    return false;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Send welcome email to a new admin who just created an organization.
 */
export async function sendWelcomeAdminEmail(params: {
  to: string;
  firstName: string;
  organizationName: string;
}): Promise<boolean> {
  return send({
    to: params.to,
    subject: `Welcome to Mitable — ${params.organizationName} is ready`,
    html: buildWelcomeAdminEmail(params),
  });
}

/**
 * Send welcome email to a new employee created by an admin.
 * Includes temporary password and login instructions.
 */
export async function sendWelcomeEmployeeEmail(params: {
  to: string;
  firstName: string;
  organizationName: string;
  temporaryPassword: string;
  loginUrl: string;
}): Promise<boolean> {
  return send({
    to: params.to,
    subject: `You've been added to ${params.organizationName} on Mitable`,
    html: buildWelcomeEmployeeEmail({ ...params, email: params.to }),
  });
}

/**
 * Send password reset email with a branded template.
 */
export async function sendPasswordResetEmail(params: {
  to: string;
  firstName: string;
  resetUrl: string;
}): Promise<boolean> {
  return send({
    to: params.to,
    subject: "Reset your Mitable password",
    html: buildPasswordResetEmail(params),
  });
}

/**
 * Send confirmation that password was changed successfully.
 */
export async function sendPasswordChangedEmail(params: {
  to: string;
  firstName: string;
}): Promise<boolean> {
  return send({
    to: params.to,
    subject: "Your Mitable password was changed",
    html: buildPasswordChangedEmail(params),
  });
}
