import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

const KEY_PREFIX = "mitable";
const SECRET_BYTES = 32;

export type ExternalApiScope = "read" | "write";

export type ExternalApiKey = {
  id: string;
  schoolId: string;
  scopes: ExternalApiScope[];
  name: string;
};

type AuthResult = { ok: true; key: ExternalApiKey } | { ok: false; response: NextResponse };

export function createExternalApiKeyCredential(id: string) {
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  return {
    credential: `${KEY_PREFIX}_${id}.${secret}`,
    keyPrefix: `${KEY_PREFIX}_${id.slice(0, 8)}`,
    keyHash: hashExternalApiKey(id, secret),
  };
}

export function hashExternalApiKey(id: string, secret: string) {
  return createHash("sha256").update(`${id}.${secret}`).digest("hex");
}

function credentialFromRequest(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return request.headers.get("x-api-key")?.trim() ?? null;
}

function parseCredential(value: string | null): { id: string; secret: string } | null {
  if (!value) return null;
  const match =
    /^mitable_([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\.([A-Za-z0-9_-]{40,})$/i.exec(value);
  if (!match) return null;
  return { id: match[1], secret: match[2] };
}

function unauthorized(message = "Invalid API key") {
  return {
    ok: false as const,
    response: NextResponse.json({ error: message }, { status: 401 }),
  };
}

/**
 * Authenticates an external credential. API keys are intentionally accepted
 * only by /api/public/v1 routes, never by the browser-session API.
 */
export async function requireExternalApiKey(
  request: Request,
  requiredScope: ExternalApiScope
): Promise<AuthResult> {
  const parsed = parseCredential(credentialFromRequest(request));
  if (!parsed) return unauthorized("An API key is required");

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("external_api_keys")
    .select("id, school_id, name, scopes, key_hash, expires_at, revoked_at")
    .eq("id", parsed.id)
    .maybeSingle();

  if (
    error ||
    !row ||
    row.revoked_at ||
    (row.expires_at && new Date(row.expires_at) <= new Date())
  ) {
    return unauthorized();
  }

  const expected = Buffer.from(row.key_hash as string, "hex");
  const received = Buffer.from(hashExternalApiKey(parsed.id, parsed.secret), "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return unauthorized();
  }

  const scopes = (row.scopes ?? []) as ExternalApiScope[];
  if (!scopes.includes(requiredScope)) {
    return {
      ok: false,
      response: NextResponse.json({ error: `${requiredScope} scope is required` }, { status: 403 }),
    };
  }

  // This is deliberately best-effort. A failed analytics update must not
  // prevent a valid caller from completing an API request.
  void admin
    .from("external_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  return {
    ok: true,
    key: {
      id: row.id as string,
      schoolId: row.school_id as string,
      name: row.name as string,
      scopes,
    },
  };
}
