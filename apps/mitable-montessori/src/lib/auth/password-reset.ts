export type PasswordResetAudience = "staff" | "parent";

export const PRODUCTION_APP_ORIGIN = "https://www.mitable.ng";

export function passwordResetAudience(value: string | null): PasswordResetAudience {
  return value === "parent" ? "parent" : "staff";
}

function passwordResetOrigin(requestOrigin: string): string {
  // Recovery emails must never inherit an internal Railway port or a stale
  // browser origin. Production always returns users to the public app.
  if (process.env.NODE_ENV !== "production") return requestOrigin.replace(/\/+$/, "");

  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configuredOrigin) return PRODUCTION_APP_ORIGIN;

  try {
    const url = new URL(configuredOrigin);
    return url.origin;
  } catch {
    return PRODUCTION_APP_ORIGIN;
  }
}

export function passwordResetCallbackUrl(origin: string, audience: PasswordResetAudience): string {
  const updatePath =
    audience === "parent" ? "/update-password?audience=parent" : "/update-password";
  return `${passwordResetOrigin(origin)}/auth/callback?redirect=${encodeURIComponent(updatePath)}`;
}

export function safeAuthRedirect(value: string | null, fallback = "/"): string {
  if (!value?.startsWith("/")) return fallback;

  try {
    const base = "https://mitable.invalid";
    const parsed = new URL(value, base);
    if (parsed.origin !== base) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
