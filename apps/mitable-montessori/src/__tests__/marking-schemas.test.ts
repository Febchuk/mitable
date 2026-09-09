import { describe, expect, it } from "vitest";
import {
  levelsForSchema,
  markToStatus,
  marksForSchema,
  statusAllowedForSchema,
  statusToMark,
} from "@/lib/progress/marking-schemas";

describe("topic marking schemas", () => {
  it("keeps IPM as the default three-level scale", () => {
    expect(levelsForSchema("ipm").map((level) => level.status)).toEqual([
      "mastered",
      "practicing",
      "introduced",
    ]);
  });

  it("exposes five real ratings plus a separate clear action", () => {
    expect(marksForSchema("five_level", true)).toEqual(["e", "g", "sat", "min", "n", "-"]);
    expect(markToStatus("n")).toBe("none");
    expect(markToStatus("-")).toBe("na");
  });

  it("round-trips every five-level status", () => {
    for (const level of levelsForSchema("five_level")) {
      expect(markToStatus(statusToMark(level.status))).toBe(level.status);
    }
  });

  it("rejects values from the other schema while allowing clear", () => {
    expect(statusAllowedForSchema("excellent", "five_level")).toBe(true);
    expect(statusAllowedForSchema("excellent", "ipm")).toBe(false);
    expect(statusAllowedForSchema("mastered", "five_level")).toBe(false);
    expect(statusAllowedForSchema("na", "five_level")).toBe(true);
  });

  it("adds N/A as a fourth IPM action, distinct from clear and absent on grades", () => {
    expect(marksForSchema("ipm", true)).toEqual(["m", "p", "i", "na", "-"]);
    expect(markToStatus("na")).toBe("not_applicable");
    expect(statusToMark("not_applicable")).toBe("na");
    // Five-level grades are unchanged — no N/A action.
    expect(marksForSchema("five_level", true)).toEqual(["e", "g", "sat", "min", "n", "-"]);
    expect(statusAllowedForSchema("not_applicable", "ipm")).toBe(true);
    expect(statusAllowedForSchema("not_applicable", "five_level")).toBe(false);
  });
});
