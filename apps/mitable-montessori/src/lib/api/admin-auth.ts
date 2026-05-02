import { NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/api/auth";

/**
 * Phase 4 admin gate. Wraps requireUser and rejects non-admin roles. Centralized
 * here so every /api/admin/** route uses the same enforcement and audit
 * tagging, rather than per-route duplication.
 *
 * RLS does the ultimate enforcement at the table level (see Phase 0 §3.3); this
 * is defense-in-depth so we get a clean 403 with a structured audit row before
 * a query is even issued.
 */
export async function requireAdmin(): Promise<
  { ok: true; user: AuthedUser } | { ok: false; response: NextResponse }
> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (auth.user.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admin role required" }, { status: 403 }),
    };
  }
  return { ok: true, user: auth.user };
}
