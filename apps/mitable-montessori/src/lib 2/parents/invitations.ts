import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 5 guardian invitation tokens.
 *
 * Token format: 32 random bytes encoded as base64url. The plaintext token
 * goes out in the email; only its SHA-256 digest is stored. Lookup at claim
 * time hashes the submitted token and looks up by digest, so a database
 * compromise alone can't be turned into a guardian session.
 */

export const INVITATION_TTL_HOURS = 24 * 14; // 14 days

export interface IssueInvitationInput {
  supabase: SupabaseClient;
  guardianId: string;
  invitedByUserId: string;
}

export interface IssueInvitationResult {
  /** Plaintext token — embed in the email URL, do NOT log. */
  token: string;
  invitationId: string;
  expiresAt: string;
}

export class InvitationError extends Error {
  constructor(
    message: string,
    public code: "not_found" | "expired" | "already_claimed" | "db_error"
  ) {
    super(message);
  }
}

/** Create a fresh invitation row + return the plaintext token to the caller. */
export async function issueInvitation(input: IssueInvitationInput): Promise<IssueInvitationResult> {
  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 3600_000).toISOString();

  const { data, error } = await input.supabase
    .from("guardian_invitations")
    .insert({
      guardian_id: input.guardianId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      invited_by_user_id: input.invitedByUserId,
    })
    .select("id")
    .single();
  if (error || !data) throw new InvitationError(error?.message ?? "Insert failed", "db_error");

  return { token, invitationId: (data as { id: string }).id, expiresAt };
}

export interface ClaimInvitationInput {
  supabase: SupabaseClient;
  token: string;
  authUserId: string;
}

export interface ClaimInvitationResult {
  guardianId: string;
  invitationId: string;
}

/**
 * Validate a submitted token and link the auth user to the guardians row. The
 * caller is expected to have just called `supabase.auth.signUp` (or its
 * equivalent) so `authUserId` is the freshly minted Supabase Auth uid.
 */
export async function claimInvitation(input: ClaimInvitationInput): Promise<ClaimInvitationResult> {
  const tokenHash = await sha256Hex(input.token);

  const { data: invitation, error: readErr } = await input.supabase
    .from("guardian_invitations")
    .select("id, guardian_id, expires_at, claimed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (readErr) throw new InvitationError(readErr.message, "db_error");
  if (!invitation) throw new InvitationError("Invitation not found", "not_found");

  const inv = invitation as {
    id: string;
    guardian_id: string;
    expires_at: string;
    claimed_at: string | null;
  };
  if (inv.claimed_at) throw new InvitationError("Invitation already claimed", "already_claimed");
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    throw new InvitationError("Invitation expired", "expired");
  }

  // Stamp the auth_user_id on the guardian row + flip claimed_at.
  const { error: linkErr } = await input.supabase
    .from("guardians")
    .update({ auth_user_id: input.authUserId })
    .eq("id", inv.guardian_id);
  if (linkErr) throw new InvitationError(linkErr.message, "db_error");

  const { error: claimErr } = await input.supabase
    .from("guardian_invitations")
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", inv.id);
  if (claimErr) throw new InvitationError(claimErr.message, "db_error");

  return { guardianId: inv.guardian_id, invitationId: inv.id };
}

// ---- helpers ----

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}
