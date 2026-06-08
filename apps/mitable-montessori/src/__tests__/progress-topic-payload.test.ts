import { describe, expect, it } from "vitest";
import {
  decodeProgressTopic,
  encodeProgressTopic,
  progressTopicToReadableText,
} from "@/lib/reports/progress-topic-payload";

describe("progress-topic-payload", () => {
  it("round-trips grid rows", () => {
    const rows = [
      {
        subtopicId: "st-1",
        name: "Pink Tower",
        status: "introduced" as const,
        comment: "Worked carefully",
      },
    ];
    const html = encodeProgressTopic(rows);
    expect(decodeProgressTopic(html)).toEqual(rows);
    expect(progressTopicToReadableText(html)).toContain("Pink Tower");
    expect(progressTopicToReadableText(html)).toContain("Introduced");
  });

  it("renders empty state copy", () => {
    expect(progressTopicToReadableText(encodeProgressTopic([]))).toMatch(/no materials/i);
  });
});
