import { describe, expect, it } from "vitest";
import {
  decodeProgressTopic,
  encodeProgressTopic,
  progressTopicToReadableText,
} from "@/lib/reports/progress-topic-payload";
import { fieldPayloadToReadableText } from "@/lib/reports/template-field-payload";

describe("progress-topic-payload", () => {
  it("encodes V2 and round-trips every reportable status", () => {
    const rows = [
      {
        subtopicId: "st-1",
        name: "Pink Tower",
        status: "introduced" as const,
        comment: "Worked carefully",
      },
      {
        subtopicId: "st-2",
        name: "Knobbed Cylinders",
        status: "practicing" as const,
        comment: null,
      },
      {
        subtopicId: "st-3",
        name: "Binomial Cube",
        status: "mastered" as const,
        comment: null,
      },
      {
        subtopicId: "st-4",
        name: "Brown Stair",
        status: "minimum" as const,
        comment: null,
      },
      {
        subtopicId: "st-5",
        name: "Red Rods",
        status: "satisfactory" as const,
        comment: null,
      },
      {
        subtopicId: "st-6",
        name: "Color Tablets",
        status: "good" as const,
        comment: null,
      },
      {
        subtopicId: "st-7",
        name: "Sound Cylinders",
        status: "excellent" as const,
        comment: null,
      },
      {
        subtopicId: "st-8",
        name: "Thermic Tablets",
        status: "none" as const,
        comment: null,
      },
    ];
    const html = encodeProgressTopic(rows);
    expect(html).toMatch(/^__MITABLE_PROGRESS_TOPIC_V2__/);
    expect(decodeProgressTopic(html)).toEqual(rows);
    const readable = progressTopicToReadableText(html);
    expect(readable).toContain("Pink Tower (Introduced)");
    expect(readable).toContain("Brown Stair (Minimum)");
    expect(readable).toContain("Red Rods (Satisfactory)");
    expect(readable).toContain("Color Tablets (Good)");
    expect(readable).toContain("Sound Cylinders (Excellent)");
    expect(readable).toContain("Thermic Tablets (None)");
    expect(fieldPayloadToReadableText(html)).toBe(readable);
  });

  it("decodes legacy V1 IPM rows", () => {
    const html =
      '__MITABLE_PROGRESS_TOPIC_V1__{"rows":[{"subtopicId":"st-1","name":"Pink Tower","status":"mastered","comment":null}]}';
    expect(decodeProgressTopic(html)).toEqual([
      {
        subtopicId: "st-1",
        name: "Pink Tower",
        status: "mastered",
        comment: null,
        topicName: undefined,
      },
    ]);
    expect(progressTopicToReadableText(html)).toContain("Pink Tower (Mastered)");
  });

  it("reports none but excludes na and unknown V2 statuses", () => {
    const html =
      '__MITABLE_PROGRESS_TOPIC_V2__{"rows":[{"subtopicId":"st-1","name":"Included","status":"none","comment":null},{"subtopicId":"st-2","name":"Excluded","status":"na","comment":null},{"subtopicId":"st-3","name":"Unknown","status":"future","comment":null}]}';
    expect(decodeProgressTopic(html)?.map((row) => row.name)).toEqual(["Included"]);
  });

  it("renders empty state copy", () => {
    expect(progressTopicToReadableText(encodeProgressTopic([]))).toMatch(/no materials/i);
  });
});
