import { afterEach, describe, expect, it, vi } from "vitest";
import type { EmailJob } from "@/lib/admin/email-worker";
import { ResendEmailSender } from "@/lib/email/resend";

function reportJob(overrides: Partial<EmailJob> = {}): EmailJob {
  return {
    recipientId: "recipient-1",
    reportId: "report-1",
    studentId: "student-1",
    guardianId: "guardian-1",
    email: "parent@example.com",
    reportDate: "2026-09-10",
    studentName: "Avery Stone",
    schoolName: "Harbour Learning Place",
    reportType: "major",
    messageBody: null,
    ...overrides,
  };
}

describe("parent report notification email", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends a portal notification without attaching the report PDF", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://school.mitable.app/");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new ResendEmailSender().send(reportJob());

    expect(result).toEqual({ ok: true, messageId: "email-1" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(payload.subject).toBe("Your child's report is ready — Harbour Learning Place");
    expect(payload).not.toHaveProperty("attachments");
    expect(payload.text).toContain(
      "https://school.mitable.app/parents/reports/report-1?child=student-1"
    );
    expect(payload.html).toContain("View report in Mitable");
    expect(payload.html).not.toContain("attached");
    expect(payload.text).not.toContain("attached");
  });

  it("keeps a teacher's personal note in the notification", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-2" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await new ResendEmailSender().send(
      reportJob({ messageBody: "Avery has had a wonderful term." })
    );

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as Record<string, string>;
    expect(payload.html).toContain("Avery has had a wonderful term.");
    expect(payload.text).toContain("Avery has had a wonderful term.");
  });
});
