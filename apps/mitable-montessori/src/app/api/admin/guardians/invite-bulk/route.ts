import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/api/admin-auth";
import { sendGuardianInviteEmail } from "@/lib/email/resend";
import { planGuardianBulkInvites } from "@/lib/parents/bulk-invitations";
import {
  invalidateActiveInvitations,
  issueInvitation,
  InvitationError,
} from "@/lib/parents/invitations";
import { getAppUrl } from "@/lib/utils/app-url";
import { createAdminClient } from "@/utils/supabase/admin";

const InviteBulkSchema = z.object({
  guardian_ids: z.array(z.string().uuid()).min(1).max(2_000),
});

type GuardianRow = {
  id: string;
  email: string | null;
  auth_user_id: string | null;
};

type SchoolMeta = {
  schoolName: string;
  inviterName: string;
};

/**
 * Send the account-setup email for guardians created or linked during a
 * roster import. This uses the same signed, one-time guardian claim flow as
 * the single-guardian invite endpoint, never Supabase's privileged client API
 * in the browser.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = InviteBulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const guardianRows = await loadGuardians(supabase, auth.user.schoolId, parsed.data.guardian_ids);
  const activeInvitationGuardianIds = await loadActiveInvitationGuardianIds(
    supabase,
    parsed.data.guardian_ids
  );
  const { eligible, skipped } = planGuardianBulkInvites({
    guardianIds: parsed.data.guardian_ids,
    guardians: guardianRows.map((guardian) => ({
      id: guardian.id,
      email: guardian.email,
      authUserId: guardian.auth_user_id,
    })),
    activeInvitationGuardianIds,
  });
  const meta = await loadSchoolMeta(supabase, auth.user.schoolId, auth.user.userId);
  const appUrl = getAppUrl(req);

  const outcomes = await mapWithConcurrency(eligible, 8, async (guardian) => {
    try {
      const issued = await issueInvitation({
        supabase,
        guardianId: guardian.id,
        invitedByUserId: auth.user.userId,
      });
      const inviteUrl = `${appUrl}/parents/claim?token=${encodeURIComponent(issued.token)}`;

      try {
        await sendGuardianInviteEmail({
          to: guardian.email!,
          inviteUrl,
          schoolName: meta.schoolName,
          inviterName: meta.inviterName,
        });
      } catch (error) {
        // A delivery failure must remain retryable by a later import or the
        // normal single-parent invite control.
        await invalidateActiveInvitations({ supabase, guardianId: guardian.id });
        return { type: "error" as const, guardianId: guardian.id, email: guardian.email!, error };
      }

      return {
        type: "sent" as const,
        guardianId: guardian.id,
        email: guardian.email!,
        invitationId: issued.invitationId,
        expiresAt: issued.expiresAt,
      };
    } catch (error) {
      return { type: "error" as const, guardianId: guardian.id, email: guardian.email!, error };
    }
  });

  const sent = outcomes
    .filter((outcome) => outcome.type === "sent")
    .map((outcome) => ({
      guardianId: outcome.guardianId,
      email: outcome.email,
      invitationId: outcome.invitationId,
      expiresAt: outcome.expiresAt,
    }));
  const errors = outcomes
    .filter((outcome) => outcome.type === "error")
    .map((outcome) => ({
      guardianId: outcome.guardianId,
      email: outcome.email,
      error:
        outcome.error instanceof InvitationError
          ? outcome.error.message
          : (outcome.error as Error).message || "Email delivery failed",
    }));

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "admin_bulk_invite_guardians",
    target_table: "guardian_invitations",
    metadata: {
      requested_count: parsed.data.guardian_ids.length,
      sent_count: sent.length,
      skipped_count: skipped.length,
      error_count: errors.length,
    },
  });

  return NextResponse.json({ sent, skipped, errors });
}

async function loadGuardians(
  supabase: ReturnType<typeof createAdminClient>,
  schoolId: string,
  guardianIds: string[]
): Promise<GuardianRow[]> {
  const guardians: GuardianRow[] = [];
  for (const ids of chunk(guardianIds, 100)) {
    const { data, error } = await supabase
      .from("guardians")
      .select("id, email, auth_user_id")
      .eq("school_id", schoolId)
      .in("id", ids);
    if (error) throw new Error(error.message);
    guardians.push(...((data ?? []) as GuardianRow[]));
  }
  return guardians;
}

async function loadActiveInvitationGuardianIds(
  supabase: ReturnType<typeof createAdminClient>,
  guardianIds: string[]
): Promise<Set<string>> {
  const activeIds = new Set<string>();
  const now = new Date().toISOString();
  for (const ids of chunk(guardianIds, 100)) {
    const { data, error } = await supabase
      .from("guardian_invitations")
      .select("guardian_id")
      .in("guardian_id", ids)
      .is("claimed_at", null)
      .gt("expires_at", now);
    if (error) throw new Error(error.message);
    for (const invitation of data ?? []) {
      activeIds.add((invitation as { guardian_id: string }).guardian_id);
    }
  }
  return activeIds;
}

async function loadSchoolMeta(
  supabase: ReturnType<typeof createAdminClient>,
  schoolId: string,
  inviterId: string
): Promise<SchoolMeta> {
  const [{ data: school }, { data: inviter }] = await Promise.all([
    supabase.from("schools").select("name").eq("id", schoolId).maybeSingle(),
    supabase.from("users").select("first_name, last_name, email").eq("id", inviterId).maybeSingle(),
  ]);
  const inviterRow = inviter as {
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
  return {
    schoolName: (school as { name?: string } | null)?.name ?? "your school",
    inviterName: inviterRow
      ? [inviterRow.first_name, inviterRow.last_name].filter(Boolean).join(" ").trim() ||
        inviterRow.email
      : "A school administrator",
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  iteratee: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await iteratee(items[currentIndex]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
