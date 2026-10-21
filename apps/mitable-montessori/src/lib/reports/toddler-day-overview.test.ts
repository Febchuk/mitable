import { expect, it } from "vitest";
import { dbToddlerDailyLogToDto } from "@/lib/toddler-routines";
import { toddlerDayOverview } from "./toddler-day-overview";

it("brings care, learning marks and observations together without inventing facts", () => {
  const log = dbToddlerDailyLogToDto({
    mood: "Cheerful",
    nap: "Slept briefly",
    activity_labels: ["Painting"],
    teacher_comments: "Shared the paintbrush.",
  });
  const overview = toddlerDayOverview(log, [
    {
      subtopicId: "beads",
      name: "Stringing",
      status: "practicing",
      comment: "Threaded three beads independently.",
    },
  ]);
  expect(overview).toContain("mood: Cheerful; nap: Slept briefly");
  expect(overview).toContain("Activities included Painting.");
  expect(overview).toContain("Stringing (Practicing)");
  expect(overview).toContain("Threaded three beads independently.");
  expect(overview).toContain("Shared the paintbrush.");
  expect(overview).not.toContain("feeding");
});
it("distinguishes missing records from a child not doing an activity", () => {
  expect(toddlerDayOverview(null, [])).toBe(
    "No Daily Log was recorded for this date.\n\nNo curriculum progress was marked for this date."
  );
});
