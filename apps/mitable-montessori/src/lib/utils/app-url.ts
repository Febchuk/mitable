/**
 * Resolve the public origin for outbound links (invite emails, magic links,
 * etc). Prefers `NEXT_PUBLIC_APP_URL` so production can pin a canonical host;
 * falls back to the request `Origin` so localhost works without env config.
 */
export function getAppUrl(req?: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  if (req) {
    const origin = req.headers.get("origin");
    if (origin) return origin.replace(/\/+$/, "");
    try {
      return new URL(req.url).origin;
    } catch {
      // fall through
    }
  }
  return "http://localhost:3000";
}
