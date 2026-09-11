/** Accept only an in-app parent destination to prevent open redirects. */
export function safeParentRedirect(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/parents/") || value.startsWith("//")) return null;
  return value;
}
