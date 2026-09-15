export type GuardianBulkInviteSkipReason =
  | "not_found"
  | "no_email"
  | "invalid_email"
  | "already_active"
  | "already_invited"
  | "duplicate";

export interface GuardianBulkInviteCandidate {
  id: string;
  email: string | null;
  authUserId: string | null;
}

export interface GuardianBulkInviteSkip {
  guardianId: string;
  email: string | null;
  reason: GuardianBulkInviteSkipReason;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Select one safe delivery attempt per guardian/email. Keeping this decision
 * separate from the route makes the import's skip contract explicit: current
 * parent accounts and live invitations are never sent another invite.
 */
export function planGuardianBulkInvites(input: {
  guardianIds: string[];
  guardians: GuardianBulkInviteCandidate[];
  activeInvitationGuardianIds: Set<string>;
}): {
  eligible: GuardianBulkInviteCandidate[];
  skipped: GuardianBulkInviteSkip[];
} {
  const guardiansById = new Map(input.guardians.map((guardian) => [guardian.id, guardian]));
  const seenGuardianIds = new Set<string>();
  const seenEmails = new Set<string>();
  const eligible: GuardianBulkInviteCandidate[] = [];
  const skipped: GuardianBulkInviteSkip[] = [];

  for (const guardianId of input.guardianIds) {
    if (seenGuardianIds.has(guardianId)) {
      skipped.push({ guardianId, email: null, reason: "duplicate" });
      continue;
    }
    seenGuardianIds.add(guardianId);

    const guardian = guardiansById.get(guardianId);
    if (!guardian) {
      skipped.push({ guardianId, email: null, reason: "not_found" });
      continue;
    }

    const email = guardian.email?.trim() || null;
    if (!email) {
      skipped.push({ guardianId, email: null, reason: "no_email" });
      continue;
    }
    if (!EMAIL_RX.test(email)) {
      skipped.push({ guardianId, email, reason: "invalid_email" });
      continue;
    }

    const emailKey = email.toLowerCase();
    if (seenEmails.has(emailKey)) {
      skipped.push({ guardianId, email, reason: "duplicate" });
      continue;
    }
    seenEmails.add(emailKey);

    if (guardian.authUserId) {
      skipped.push({ guardianId, email, reason: "already_active" });
      continue;
    }
    if (input.activeInvitationGuardianIds.has(guardianId)) {
      skipped.push({ guardianId, email, reason: "already_invited" });
      continue;
    }
    eligible.push({ ...guardian, email });
  }

  return { eligible, skipped };
}
