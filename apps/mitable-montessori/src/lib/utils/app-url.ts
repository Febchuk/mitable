import { PRODUCTION_APP_ORIGIN } from "@/lib/auth/password-reset";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

function isLoopbackOrigin(origin: string): boolean {
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * Resolve the public origin for outbound links (invite emails, magic links,
 * auth-callback redirects, etc). Prefers `NEXT_PUBLIC_APP_URL` so production can
 * pin a canonical host; falls back to the request `Origin` so localhost works
 * without env config.
 *
 * In production we must never fall back to a request-derived loopback origin:
 * server handlers on Railway see the container's internal host (e.g.
 * `http://localhost:8080`, the runtime `$PORT`), and leaking that into a
 * redirect or email is the "internal Railway port" bug. When the env pin is
 * missing there, we return the canonical production origin instead.
 */
export function getAppUrl(req?: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/+$/, "");

  const isProduction = process.env.NODE_ENV === "production";

  if (req) {
    const headerOrigin = req.headers.get("origin");
    let candidate = headerOrigin?.replace(/\/+$/, "") ?? null;
    if (!candidate) {
      try {
        candidate = new URL(req.url).origin;
      } catch {
        candidate = null;
      }
    }
    if (candidate && !(isProduction && isLoopbackOrigin(candidate))) {
      return candidate;
    }
  }

  return isProduction ? PRODUCTION_APP_ORIGIN : "http://localhost:3000";
}
