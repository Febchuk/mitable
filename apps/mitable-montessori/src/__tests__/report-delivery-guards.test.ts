import { afterEach, expect, it, vi } from "vitest";
import { drainPendingReports } from "@/lib/admin/email-worker";
import { ResendEmailSender } from "@/lib/email/resend";
import { reportMemoryDb } from "./helpers/report-memory-db";

function fixture(overrides = {}) {
  return reportMemoryDb({
    report_recipients: [
      {
        id: "recipient",
        report_id: "report",
        guardian_id: "guardian",
        email_snapshot: "qa@example.invalid",
        delivery_status: "pending",
        attempts: 0,
        first_attempt_at: null,
        claimed_at: null,
        report_publications: {
          snapshot: {
            student_id: "child",
            report_date: "2026-11-19",
            report_type: "daily",
            student_name: "QA",
            school_name: "The Learning Place",
          },
        },
        ...overrides,
      },
    ],
  });
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("allows only one of two simultaneous workers to send a queued recipient", async () => {
  const { db, tables } = fixture();
  const sender = { send: vi.fn().mockResolvedValue({ ok: true, messageId: "provider-id" }) };
  const results = await Promise.all([
    drainPendingReports(db, sender),
    drainPendingReports(db, sender),
  ]);
  expect(sender.send).toHaveBeenCalledTimes(1);
  expect(results.reduce((n, r) => n + r.sent, 0)).toBe(1);
  expect(tables.report_recipients[0]).toMatchObject({
    delivery_status: "sent",
    attempts: 1,
    provider_id: "provider-id",
  });
  await drainPendingReports(db, sender);
  expect(sender.send).toHaveBeenCalledTimes(1);
});

it("retries a failed provider request with the same recipient key", async () => {
  const { db, tables } = fixture();
  const sender = {
    send: vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "Timeout" })
      .mockResolvedValueOnce({ ok: true, messageId: "accepted" }),
  };
  expect((await drainPendingReports(db, sender)).failed).toBe(1);
  expect(tables.report_recipients[0].delivery_status).toBe("failed");
  expect((await drainPendingReports(db, sender)).sent).toBe(1);
  expect(sender.send.mock.calls.map(([job]) => job.recipientId)).toEqual([
    "recipient",
    "recipient",
  ]);
  expect(tables.report_recipients[0].attempts).toBe(2);
});

it("waits for an active delivery lease, then recovers an interrupted delivery", async () => {
  const { db, tables } = fixture({
    delivery_status: "sending",
    attempts: 1,
    first_attempt_at: new Date().toISOString(),
    claimed_at: new Date().toISOString(),
  });
  const sender = { send: vi.fn().mockResolvedValue({ ok: true, messageId: "accepted" }) };
  expect((await drainPendingReports(db, sender)).pending).toBe(1);
  expect(sender.send).not.toHaveBeenCalled();
  tables.report_recipients[0].claimed_at = new Date(Date.now() - 6 * 60_000).toISOString();
  expect((await drainPendingReports(db, sender)).sent).toBe(1);
});

it("holds an uncertain old attempt for review rather than risking another email", async () => {
  const { db, tables } = fixture({
    delivery_status: "failed",
    attempts: 1,
    first_attempt_at: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
  });
  const sender = { send: vi.fn() };
  expect((await drainPendingReports(db, sender)).needsReview).toBe(1);
  expect(sender.send).not.toHaveBeenCalled();
  expect(tables.report_recipients[0].delivery_status).toBe("needs_review");
  expect((await drainPendingReports(db, sender)).needsReview).toBe(1);
  expect(sender.send).not.toHaveBeenCalled();
});

it("uses the provider's duplicate-prevention header and the exact parent report link", async () => {
  vi.stubEnv("RESEND_API_KEY", "fake-for-test-only");
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "accepted" }) });
  vi.stubGlobal("fetch", fetcher);
  const { db } = fixture();
  await drainPendingReports(db, new ResendEmailSender());
  const [, request] = fetcher.mock.calls[0];
  expect(request.headers["Idempotency-Key"]).toBe("report/recipient");
  expect(JSON.parse(request.body).text).toContain("/parents/reports/report?child=child");
  expect(JSON.parse(request.body).html).toContain("the-learning-place");
});

it("does not mark an unconfirmed provider response as delivered", async () => {
  vi.stubEnv("RESEND_API_KEY", "fake-for-test-only");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  const { db, tables } = fixture();
  expect((await drainPendingReports(db, new ResendEmailSender())).failed).toBe(1);
  expect(tables.report_recipients[0].delivery_status).toBe("failed");
});
