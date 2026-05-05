import type { SupabaseClient } from "@supabase/supabase-js";
import { InvitationError } from "@/lib/parents/invitations";

/**
 * Teacher invitation tokens.
 *
 * Mirrors guardian invitations but stores the invitee's email + school_id on
 * the invitation row itself, because (unlike guardians) there is no canonical
 * users row until the teacher claims — `users.id` is `auth.users.id` and the
 * auth user doesn't exist until claim time.
 */

export { InvitationError };

export const INVITATION_TTL_HOURS = 24 * 14; // 14 days

export interface IssueInvitationInput {
  supabase: SupabaseClient;
  schoolId: string;
  email: string;
  invitedByUserId: string;
}

export interface IssueInvitationResult {
  /** Plaintext token — embed in the email URL, do NOT log. */
  token: string;
  invitationId: string;
  expiresAt: string;
}

/** Create a fresh invitation row + return the plaintext token to the caller. */
export async function issueTeacherInvitation(
  input: IssueInvitationInput
): Promise<IssueInvitationResult> {
  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 3600_000).toISOString();

  const { data, error } = await input.supabase
    .from("teacher_invitations")
    .insert({
      school_id: input.schoolId,
      email: input.email.trim().toLowerCase(),
      token_hash: tokenHash,
      expires_at: expiresAt,
      invited_by_user_id: input.invitedByUserId,
    })
    .select("id")
    .single();
  if (error || !data) throw new InvitationError(error?.message ?? "Insert failed", "db_error");

  return { token, invitationId: (data as { id: string }).id, expiresAt };
}

export interface InvalidateInput {
  supabase: SupabaseClient;
  schoolId: string;
  email: string;
}

/** Mark every unclaimed invite for an email/school as claimed_at = now() so a
 * fresh re-invite can supersede it without leaving a live token in the wild.
 * (We don't delete because the audit trail is more useful than the row.) */
export async function invalidateActiveInvites(input: InvalidateInput): Promise<void> {
  const { error } = await input.supabase
    .from("teacher_invitations")
    .update({ claimed_at: new Date().toISOString() })
    .eq("school_id", input.schoolId)
    .eq("email", input.email.trim().toLowerCase())
    .is("claimed_at", null);
  if (error) throw new InvitationError(error.message, "db_error");
}

export interface PendingInviteRow {
  id: string;
  email: string;
  expires_at: string;
  claimed_at: string | null;
  invited_by_user_id: string;
  created_at: string;
}

/** All invitations (active + historical) for a school. The roster route uses
 * the latest unclaimed row to compute Pending vs Expired status. */
export async function listInvitationsForSchool(
  supabase: SupabaseClient,
  schoolId: string
): Promise<PendingInviteRow[]> {
  const { data, error } = await supabase
    .from("teacher_invitations")
    .select("id, email, expires_at, claimed_at, invited_by_user_id, created_at")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });
  if (error) throw new InvitationError(error.message, "db_error");
  return (data ?? []) as PendingInviteRow[];
}

export interface LookupResult {
  invitationId: string;
  schoolId: string;
  email: string;
  expiresAt: string;
  claimedAt: string | null;
}

/** Read-only token lookup. Used by the public claim page to show "you're
 * being invited to <school>" before the user submits a password. Does NOT
 * mark the invitation claimed. */
export async function lookupInvitation(
  supabase: SupabaseClient,
  token: string
): Promise<LookupResult> {
  const tokenHash = await sha256Hex(token);
  const { data, error } = await supabase
    .from("teacher_invitations")
    .select("id, school_id, email, expires_at, claimed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new InvitationError(error.message, "db_error");
  if (!data) throw new InvitationError("Invitation not found", "not_found");
  const row = data as {
    id: string;
    school_id: string;
    email: string;
    expires_at: string;
    claimed_at: string | null;
  };
  if (row.claimed_at) throw new InvitationError("Invitation already claimed", "already_claimed");
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new InvitationError("Invitation expired", "expired");
  }
  return {
    invitationId: row.id,
    schoolId: row.school_id,
    email: row.email,
    expiresAt: row.expires_at,
    claimedAt: row.claimed_at,
  };
}

export interface ClaimInvitationInput {
  supabase: SupabaseClient;
  token: string;
  authUserId: string;
}

export interface ClaimInvitationResult {
  invitationId: string;
  schoolId: string;
  email: string;
}

/**
 * Validate the token and stamp claimed_at. Caller must have already created
 * the auth user + the corresponding `users` row (with `users.id = authUserId`)
 * before invoking this so the FK from claimed_user_id is valid.
 */
export async function claimTeacherInvitation(
  input: ClaimInvitationInput
): Promise<ClaimInvitationResult> {
  const tokenHash = await sha256Hex(input.token);

  const { data: invitation, error: readErr } = await input.supabase
    .from("teacher_invitations")
    .select("id, school_id, email, expires_at, claimed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (readErr) throw new InvitationError(readErr.message, "db_error");
  if (!invitation) throw new InvitationError("Invitation not found", "not_found");

  const inv = invitation as {
    id: string;
    school_id: string;
    email: string;
    expires_at: string;
    claimed_at: string | null;
  };
  if (inv.claimed_at) throw new InvitationError("Invitation already claimed", "already_claimed");
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    throw new InvitationError("Invitation expired", "expired");
  }

  const { error: claimErr } = await input.supabase
    .from("teacher_invitations")
    .update({
      claimed_at: new Date().toISOString(),
      claimed_user_id: input.authUserId,
    })
    .eq("id", inv.id);
  if (claimErr) throw new InvitationError(claimErr.message, "db_error");

  return { invitationId: inv.id, schoolId: inv.school_id, email: inv.email };
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
