import { describe, expect, it } from "vitest";
import { AttendancePayloadSchema } from "./command";
const base = {
  student_id: "11111111-1111-4111-8111-111111111111",
  status: "present",
  date: "2026-10-14",
};
describe("half-day attendance", () => {
  it("keeps a half-day and arrival/pickup times", () => {
    expect(
      AttendancePayloadSchema.parse({
        ...base,
        half_day: true,
        arrival_time: "11:30",
        departure_time: "13:00",
      })
    ).toMatchObject({ half_day: true, arrival_time: "11:30", departure_time: "13:00" });
  });
  it("continues accepting full-day bulk marks", () => {
    expect(AttendancePayloadSchema.safeParse(base).success).toBe(true);
  });
  it.each(["25:00", "12:60", "9:3"])("rejects invalid pickup time %s", (departure_time) => {
    expect(AttendancePayloadSchema.safeParse({ ...base, departure_time }).success).toBe(false);
  });
});
