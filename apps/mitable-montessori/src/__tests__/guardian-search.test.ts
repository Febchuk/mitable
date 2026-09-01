import { describe, expect, it } from "vitest";
import { mergeGuardianSearchResults } from "@/lib/admin/guardian-search";

describe("guardian search", () => {
  it("deduplicates matches and excludes guardians already linked to the child", () => {
    const jordan = {
      id: "guardian-1",
      first_name: "Jordan",
      last_name: "Stone",
      email: "jordan@example.com",
      phone: null,
      preferred_contact_method: "email" as const,
      auth_user_id: "auth-1",
    };
    const alex = {
      id: "guardian-2",
      first_name: "Alex",
      last_name: "Stone",
      email: "alex@example.com",
      phone: "+1 555 0100",
      preferred_contact_method: "either" as const,
      auth_user_id: null,
    };

    expect(mergeGuardianSearchResults([[jordan, alex], [jordan]], new Set(["guardian-1"]))).toEqual(
      [
        {
          id: "guardian-2",
          firstName: "Alex",
          lastName: "Stone",
          email: "alex@example.com",
          phone: "+1 555 0100",
          preferredContactMethod: "either",
          accountActive: false,
        },
      ]
    );
  });
});
