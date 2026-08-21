/**
 * Image validation + API error classification shared by all BYOK providers.
 *
 * Why this lives in providers/:
 *  - The bad-frame problem (a capture's base64 payload is undecodable) used to
 *    cause the whole batch to fail with a 400 "invalid base64 data" from
 *    Anthropic. We pre-validate here so any provider can ship the same fix.
 *  - Different providers return different shapes for billing / quota / rate
 *    limit errors. We surface a single, user-friendly BillingError so the
 *    session pipeline can stop early and tell the user to top up.
 */

import type { ProviderName } from "./types";

/**
 * Quick check that a data-URL's base64 payload actually decodes.
 * We don't re-encode the image — we just want to know "is this safe to send?"
 *
 * A real validation would also confirm PNG/JPEG magic bytes. For now, decoding
 * is the only thing the providers themselves do, so matching their bar keeps
 * us out of trouble. If you ever need stricter checks (file size, dimensions),
 * add them here.
 */
export function isValidBase64Image(dataUrl: string | undefined | null): boolean {
  if (!dataUrl || typeof dataUrl !== "string") return false;
  const payload = dataUrl.startsWith("data:")
    ? dataUrl.replace(/^data:[^;]+;base64,/, "")
    : dataUrl;
  if (payload.length === 0) return false;
  // Buffer.from is permissive — strict base64 chars only, length % 4 == 0 (with padding).
  // Anything outside that set is garbage we should drop, not ship to the API.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) return false;
  try {
    const buf = Buffer.from(payload, "base64");
    if (buf.length === 0) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Thrown when a provider returns a user-actionable billing / quota / auth error.
 * Carries a friendly `userMessage` we can show in the block card and forward
 * to the renderer via the existing pipeline-error IPC path.
 */
export class BillingError extends Error {
  readonly kind: ApiErrorKind;
  readonly provider: ProviderName;
  readonly userMessage: string;
  readonly status: number;

  constructor(opts: {
    kind: ApiErrorKind;
    provider: ProviderName;
    status: number;
    userMessage: string;
    rawMessage: string;
  }) {
    super(opts.rawMessage);
    this.name = "BillingError";
    this.kind = opts.kind;
    this.provider = opts.provider;
    this.userMessage = opts.userMessage;
    this.status = opts.status;
  }
}

export type ApiErrorKind = "auth" | "billing" | "quota" | "rate_limit" | "server" | "unknown";

/**
 * Classify a non-OK API response into a user-actionable kind, or return null
 * if the error is a generic server problem (caller should throw a normal Error).
 *
 * Recognised signals:
 *   401 invalid api key / unauthorized
 *   402 payment required (some providers)
 *   403 quota exceeded / insufficient credit
 *   429 rate limit / quota exceeded
 *   5xx upstream / model unavailable
 */
export function classifyApiError(
  provider: ProviderName,
  status: number,
  body: string
): BillingError | null {
  const lower = body.toLowerCase();

  // Rate limit & quota are usually 429, but Anthropic sometimes returns 529 for overload.
  if (status === 429 || lower.includes("rate_limit") || lower.includes("rate limit")) {
    return new BillingError({
      kind: "rate_limit",
      provider,
      status,
      userMessage: `${providerLabel(provider)} rate limit hit. Wait a minute or upgrade your plan, then re-process this block.`,
      rawMessage: `${providerLabel(provider)} API ${status}: ${body.slice(0, 300)}`,
    });
  }

  // Auth: bad/missing/expired key
  if (status === 401) {
    return new BillingError({
      kind: "auth",
      provider,
      status,
      userMessage: `Your ${providerLabel(provider)} API key is invalid or expired. Update it in Settings, then re-process this block.`,
      rawMessage: `${providerLabel(provider)} API ${status}: ${body.slice(0, 300)}`,
    });
  }

  // Billing / quota: payment required OR quota-exceeded messages in the body
  if (
    status === 402 ||
    lower.includes("insufficient credit") ||
    lower.includes("insufficient_quota") ||
    lower.includes("insufficient quota") ||
    lower.includes("payment required") ||
    lower.includes("quota exceeded") ||
    lower.includes("you've exceeded") ||
    lower.includes("billing") ||
    lower.includes("credit balance")
  ) {
    return new BillingError({
      kind: "billing",
      provider,
      status,
      userMessage: `Your ${providerLabel(provider)} account is out of credit. Top up your ${providerLabel(provider)} balance, then re-process this block.`,
      rawMessage: `${providerLabel(provider)} API ${status}: ${body.slice(0, 300)}`,
    });
  }

  // 5xx is "their problem, not yours" — generic, no need for BillingError
  return null;
}

function providerLabel(provider: ProviderName): string {
  switch (provider) {
    case "anthropic":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "google":
      return "Google";
  }
}
