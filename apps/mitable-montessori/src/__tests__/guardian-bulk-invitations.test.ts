import { describe, expect, it } from "vitest";
import { planGuardianBulkInvites } from "@/lib/parents/bulk-invitations";

describe("bulk guardian invitation planning", () => {
  it("only selects parents who can safely receive a first invitation", () => {
    const result = planGuardianBulkInvites({
      guardianIds: ["ready", "account", "pending", "missing-email", "ready", "unknown"],
      guardians: [
        { id: "ready", email: "parent@example.com", authUserId: null },
        { id: "account", email: "active@example.com", authUserId: "auth-user" },
        { id: "pending", email: "pending@example.com", authUserId: null },
        { id: "missing-email", email: null, authUserId: null },
      ],
      activeInvitationGuardianIds: new Set(["pending"]),
    });

    expect(result.eligible).toEqual([
      { id: "ready", email: "parent@example.com", authUserId: null },
    ]);
    expect(result.skipped).toEqual([
      { guardianId: "account", email: "active@example.com", reason: "already_active" },
      { guardianId: "pending", email: "pending@example.com", reason: "already_invited" },
      { guardianId: "missing-email", email: null, reason: "no_email" },
      { guardianId: "ready", email: null, reason: "duplicate" },
      { guardianId: "unknown", email: null, reason: "not_found" },
    ]);
  });

  it("never sends the same email twice when legacy duplicate guardian rows exist", () => {
    const result = planGuardianBulkInvites({
      guardianIds: ["first", "second"],
      guardians: [
        { id: "first", email: "PARENT@example.com", authUserId: null },
        { id: "second", email: "parent@example.com", authUserId: null },
      ],
      activeInvitationGuardianIds: new Set(),
    });

    expect(result.eligible.map((guardian) => guardian.id)).toEqual(["first"]);
    expect(result.skipped).toEqual([
      { guardianId: "second", email: "parent@example.com", reason: "duplicate" },
    ]);
  });
});
