import { describe, expect, it } from "vitest";
import {
  executeStudentImportPlan,
  type GuardianBulkInviteResponse,
} from "@/lib/admin/execute-student-import-plan";
import { EMPTY_STUDENT_IMPORT_PROFILE, type StudentImportPlan } from "@/lib/admin/student-import";

function importPlan(): StudentImportPlan {
  return {
    newStudents: [
      {
        draftId: "child-1",
        studentKey: "child-1",
        firstName: "Maya",
        lastName: "Patel",
        fullName: "Maya Patel",
        birthDate: "2019-04-15",
        classroomId: null,
        profile: { ...EMPTY_STUDENT_IMPORT_PROFILE },
        guardians: [
          {
            name: "Asha Patel",
            email: "asha@example.com",
            relationship: "mother",
            primary: true,
          },
          {
            name: "Dev Patel",
            email: "dev@example.com",
            relationship: "father",
            primary: false,
          },
        ],
      },
    ],
    guardiansForExisting: [],
  };
}

function createApiStub(options: { inviteFails?: boolean } = {}) {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  let guardianNumber = 0;
  const apiJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const body = JSON.parse((init?.body as string | undefined) ?? "{}") as Record<string, unknown>;
    requests.push({ url, body });
    if (url === "/api/admin/students") return { ok: true, id: "student-1" } as T;
    if (url === "/api/admin/guardians") {
      guardianNumber += 1;
      return { ok: true, id: `guardian-${guardianNumber}` } as T;
    }
    if (url === "/api/admin/student-guardians") return { ok: true, id: "link-1" } as T;
    if (url === "/api/admin/guardians/invite-bulk") {
      if (options.inviteFails) throw new Error("Email service unavailable");
      return {
        sent: [
          { guardianId: "guardian-1", email: "asha@example.com" },
          { guardianId: "guardian-2", email: "dev@example.com" },
        ],
        skipped: [],
        errors: [],
      } satisfies GuardianBulkInviteResponse as T;
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return { apiJson, requests };
}

describe("executeStudentImportPlan", () => {
  it("passes newly linked guardian ids to the secure bulk invite endpoint when requested", async () => {
    const { apiJson, requests } = createApiStub();

    const result = await executeStudentImportPlan(apiJson, importPlan(), {}, [], true);

    expect(result.guardianInvites?.sent).toHaveLength(2);
    expect(requests.at(-1)).toEqual({
      url: "/api/admin/guardians/invite-bulk",
      body: { guardian_ids: ["guardian-1", "guardian-2"] },
    });
  });

  it("does not send invitations unless the admin selected the option", async () => {
    const { apiJson, requests } = createApiStub();

    await executeStudentImportPlan(apiJson, importPlan(), {}, [], false);

    expect(requests.map((request) => request.url)).not.toContain(
      "/api/admin/guardians/invite-bulk"
    );
  });

  it("keeps the roster import successful when the invitation request fails", async () => {
    const { apiJson, requests } = createApiStub({ inviteFails: true });

    const result = await executeStudentImportPlan(apiJson, importPlan(), {}, [], true);

    expect(result.guardianInvites?.errors).toEqual([
      { guardianId: "", email: "", error: "Email service unavailable" },
    ]);
    expect(requests.map((request) => request.url)).toContain("/api/admin/students");
  });
});
