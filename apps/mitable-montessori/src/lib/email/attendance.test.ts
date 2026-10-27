import { afterEach, expect, it, vi } from "vitest";
import { renderAttendanceEmail, sendAttendanceEmail } from "./attendance";
const input = {
  to: "parent@example.test",
  studentName: "Ada <Child>",
  schoolName: "The Learning Place",
  classroomName: "Toddler's House",
  date: "2026-10-27",
  status: "present" as const,
  comment: "<script>bad</script>",
  arrivalTime: "08:30:00",
  departureTime: null,
  halfDay: true,
  appUrl: "https://school.example",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("renders marked attendance, escaped notes, transparent logo, and school contact", () => {
  const email = renderAttendanceEmail(input);
  expect(email.text).toContain("marked present");
  expect(email.text).toContain("Arrival: 08:30");
  expect(email.html).toContain("https://school.example/school-brands/the-learning-place.png");
  expect(email.html).toContain("&lt;script&gt;");
  expect(email.html).not.toContain("<script>");
  expect(email.reply_to).toBe("academics@thelearningplaceng.com");
});
it("does not attach TLP branding or present-only times to another school's absence", () => {
  const email = renderAttendanceEmail({ ...input, schoolName: "Another School", status: "absent" });
  expect(email.text).toContain("marked absent");
  expect(email.text).not.toContain("Arrival:");
  expect(email.html).not.toContain("the-learning-place.png");
  expect(email.reply_to).toBeUndefined();
});
it("uses a stable provider idempotency key for retries without sending real emails", async () => {
  vi.stubEnv("RESEND_API_KEY", "test-key");
  const send = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "email-1" }) });
  vi.stubGlobal("fetch", send);
  const payload = renderAttendanceEmail(input);
  expect(await sendAttendanceEmail(payload, "delivery-1")).toBe("email-1");
  expect(send.mock.calls[0][1].headers["Idempotency-Key"]).toBe("attendance/delivery-1");
  expect(JSON.parse(send.mock.calls[0][1].body)).toEqual(payload);
});
