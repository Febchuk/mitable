export type PasswordResetAudience = "staff" | "parent";

export function passwordResetAudience(value: string | null): PasswordResetAudience {
  return value === "parent" ? "parent" : "staff";
}

export function passwordResetCallbackUrl(origin: string, audience: PasswordResetAudience): string {
  const updatePath =
    audience === "parent" ? "/update-password?audience=parent" : "/update-password";
  return `${origin}/auth/callback?redirect=${encodeURIComponent(updatePath)}`;
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
