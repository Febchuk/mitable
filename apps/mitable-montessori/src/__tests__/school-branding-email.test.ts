import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendEmailSender, sendGuardianInviteEmail } from "@/lib/email/resend";

describe("The Learning Place email branding", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("adds the school logo and Head of School contact to parent invitations", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    const send = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "email-1" }) });
    vi.stubGlobal("fetch", send);

    await sendGuardianInviteEmail({
      to: "parent@example.com",
      inviteUrl: "https://example.com/claim",
      schoolName: "The Learning Place",
      inviterName: "Ada",
    });

    const message = JSON.parse(send.mock.calls[0][1].body);
    expect(message.html).toContain("cropped-TLP_logo.jpg");
    expect(message.html).toContain("mailto:hos@thelearningplaceng.com");
    expect(message.text).toContain("hos@thelearningplaceng.com");
  });

  it("keeps another school's report email free of The Learning Place identity", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    const send = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "email-2" }) });
    vi.stubGlobal("fetch", send);

    await new ResendEmailSender().send({
      recipientId: "recipient-1",
      reportId: "report-1",
      studentId: "student-1",
      guardianId: "guardian-1",
      email: "parent@example.com",
      reportDate: "2026-10-13",
      studentName: "Ben",
      schoolName: "Another School",
      reportType: "daily",
      messageBody: null,
    });

    const message = JSON.parse(send.mock.calls[0][1].body);
    expect(message.html).not.toContain("cropped-TLP_logo.jpg");
    expect(message.html).not.toContain("hos@thelearningplaceng.com");
  });

  it("adds the Head of School contact to this school's report emails", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    const send = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "email-3" }) });
    vi.stubGlobal("fetch", send);

    await new ResendEmailSender().send({
      recipientId: "recipient-1",
      reportId: "report-1",
      studentId: "student-1",
      guardianId: "guardian-1",
      email: "parent@example.com",
      reportDate: "2026-10-13",
      studentName: "Ada",
      schoolName: "The Learning Place",
      reportType: "daily",
      messageBody: null,
    });

    const message = JSON.parse(send.mock.calls[0][1].body);
    expect(message.html).toContain("cropped-TLP_logo.jpg");
    expect(message.html).toContain("mailto:hos@thelearningplaceng.com");
    expect(message.text).toContain("hos@thelearningplaceng.com");
  });
});
