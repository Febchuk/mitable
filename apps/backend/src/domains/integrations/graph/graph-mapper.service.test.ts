import type { ActivityEvent } from "./types";

// Mock db before importing the service
jest.mock("../../../db/client", () => ({
  db: {
    select: jest.fn().mockReturnThis(),
    selectDistinct: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnValue([]),
  },
}));
jest.mock("../../../db/schema/index", () => ({}));
jest.mock("../../../config", () => ({
  config: { graph: { enabled: false, lookbackDays: 30, topKFacts: 10 } },
}));
jest.mock("../../shared-infra/lib/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { graphMapperService } from "./graph-mapper.service";

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    eventId: "evt-1",
    occurredAt: "2026-03-01T10:00:00Z",
    userId: "user-1",
    orgId: "org-1",
    sessionId: "sess-1",
    appName: "VS Code",
    windowTitle: "index.ts",
    activityDescription: "writing code in editor",
    actionType: "typing",
    sourceType: "session_capture",
    confidence: 0.7,
    ...overrides,
  };
}

describe("GraphMapperService", () => {
  describe("normalizeAppName", () => {
    it("maps known aliases", () => {
      expect(graphMapperService.normalizeAppName("Google Chrome")).toBe("Chrome");
      expect(graphMapperService.normalizeAppName("visual studio code")).toBe("VS Code");
      expect(graphMapperService.normalizeAppName("iterm2")).toBe("Terminal");
    });

    it("passes through unknown apps", () => {
      expect(graphMapperService.normalizeAppName("CustomApp")).toBe("CustomApp");
    });

    it("handles null", () => {
      expect(graphMapperService.normalizeAppName(null)).toBeNull();
    });

    it("trims whitespace", () => {
      expect(graphMapperService.normalizeAppName("  slack  ")).toBe("Slack");
    });
  });

  describe("deduplicateEvents", () => {
    it("returns empty for empty input", () => {
      expect(graphMapperService.deduplicateEvents([])).toEqual([]);
    });

    it("returns single event unchanged", () => {
      const events = [makeEvent()];
      expect(graphMapperService.deduplicateEvents(events)).toHaveLength(1);
    });

    it("collapses events within 90s window with same user/app/window/activity", () => {
      const events = [
        makeEvent({ eventId: "e1", occurredAt: "2026-03-01T10:00:00Z", confidence: 0.7 }),
        makeEvent({ eventId: "e2", occurredAt: "2026-03-01T10:01:00Z", confidence: 0.85 }), // 60s later
      ];
      const result = graphMapperService.deduplicateEvents(events);
      expect(result).toHaveLength(1);
      expect(result[0]!.confidence).toBe(0.85); // keeps higher confidence
    });

    it("does not collapse events beyond 90s window", () => {
      const events = [
        makeEvent({ eventId: "e1", occurredAt: "2026-03-01T10:00:00Z" }),
        makeEvent({ eventId: "e2", occurredAt: "2026-03-01T10:02:00Z" }), // 120s later
      ];
      const result = graphMapperService.deduplicateEvents(events);
      expect(result).toHaveLength(2);
    });

    it("respects user boundaries", () => {
      const events = [
        makeEvent({ eventId: "e1", userId: "user-1", occurredAt: "2026-03-01T10:00:00Z" }),
        makeEvent({ eventId: "e2", userId: "user-2", occurredAt: "2026-03-01T10:00:30Z" }),
      ];
      const result = graphMapperService.deduplicateEvents(events);
      expect(result).toHaveLength(2);
    });

    it("does not collapse different apps", () => {
      const events = [
        makeEvent({ eventId: "e1", appName: "VS Code", occurredAt: "2026-03-01T10:00:00Z" }),
        makeEvent({ eventId: "e2", appName: "Chrome", occurredAt: "2026-03-01T10:00:30Z" }),
      ];
      const result = graphMapperService.deduplicateEvents(events);
      expect(result).toHaveLength(2);
    });
  });

  describe("deriveAppBehaviors", () => {
    it("groups by user and app, extracts top activities", () => {
      const events = [
        makeEvent({ activityDescription: "editing code" }),
        makeEvent({ activityDescription: "editing code" }),
        makeEvent({ activityDescription: "reviewing diff" }),
      ];
      const behaviors = graphMapperService.deriveAppBehaviors(events);
      expect(behaviors).toHaveLength(1);
      expect(behaviors[0]!.appName).toBe("VS Code");
      expect(behaviors[0]!.topActivities[0]).toBe("editing code");
      expect(behaviors[0]!.evidenceCount).toBe(3);
    });

    it("skips events with null appName", () => {
      const events = [makeEvent({ appName: null })];
      const behaviors = graphMapperService.deriveAppBehaviors(events);
      expect(behaviors).toHaveLength(0);
    });

    it("limits top activities to 5", () => {
      const events = Array.from({ length: 10 }, (_, i) =>
        makeEvent({ activityDescription: `activity ${i}` })
      );
      const behaviors = graphMapperService.deriveAppBehaviors(events);
      expect(behaviors[0]!.topActivities.length).toBeLessThanOrEqual(5);
    });

    it("generates behavior statement", () => {
      const events = [
        makeEvent({ activityDescription: "coding" }),
        makeEvent({ activityDescription: "testing" }),
        makeEvent({ activityDescription: "debugging" }),
      ];
      const behaviors = graphMapperService.deriveAppBehaviors(events);
      expect(behaviors[0]!.behaviorStatement).toContain("VS Code");
    });
  });

  describe("resolveArchetype", () => {
    it("matches keyword in activityDescription", () => {
      const event = makeEvent({ activityDescription: "writing code in editor" });
      expect(graphMapperService.resolveArchetype(event)).toBe("code_authoring");
    });

    it("falls back to category alias", () => {
      const event = makeEvent({
        activityDescription: "some random activity",
        metadata: { category: "development" },
      });
      expect(graphMapperService.resolveArchetype(event)).toBe("code_authoring");
    });

    it("returns null when no match", () => {
      const event = makeEvent({
        activityDescription: "idle watching cat videos",
        metadata: {},
      });
      expect(graphMapperService.resolveArchetype(event)).toBeNull();
    });

    it("matches debugging keywords", () => {
      const event = makeEvent({ activityDescription: "debugging a null pointer error" });
      expect(graphMapperService.resolveArchetype(event)).toBe("debugging");
    });

    it("matches messaging keywords", () => {
      const event = makeEvent({ activityDescription: "reading slack messages" });
      expect(graphMapperService.resolveArchetype(event)).toBe("messaging");
    });

    it("matches meeting keywords", () => {
      const event = makeEvent({ activityDescription: "on a zoom video call" });
      expect(graphMapperService.resolveArchetype(event)).toBe("meeting");
    });
  });

  describe("mapToArchetypes", () => {
    it("accumulates evidence per archetype", () => {
      const events = [
        makeEvent({ activityDescription: "writing code" }),
        makeEvent({ activityDescription: "coding and implementing" }),
        makeEvent({ activityDescription: "debugging an error" }),
      ];
      const mappings = graphMapperService.mapToArchetypes(events);
      const codingMapping = mappings.find((m) => m.archetypeKey === "code_authoring");
      expect(codingMapping).toBeDefined();
      expect(codingMapping!.evidenceCount).toBe(2);
    });

    it("skips events with no archetype match", () => {
      const events = [makeEvent({ activityDescription: "staring at wall" })];
      const mappings = graphMapperService.mapToArchetypes(events);
      expect(mappings).toHaveLength(0);
    });

    it("sorts by evidence count descending", () => {
      const events = [
        makeEvent({ activityDescription: "writing code" }),
        makeEvent({ activityDescription: "writing code again" }),
        makeEvent({ activityDescription: "debugging issue" }),
      ];
      const mappings = graphMapperService.mapToArchetypes(events);
      if (mappings.length > 1) {
        expect(mappings[0]!.evidenceCount).toBeGreaterThanOrEqual(mappings[1]!.evidenceCount);
      }
    });
  });

  describe("minePatterns", () => {
    it("detects 2+ occurrence chains", () => {
      // Create two identical episodes with a coding -> debugging pattern
      const baseTime = new Date("2026-03-01T10:00:00Z").getTime();
      const events = [
        // Episode 1
        makeEvent({
          eventId: "e1",
          occurredAt: new Date(baseTime).toISOString(),
          activityDescription: "writing code",
        }),
        makeEvent({
          eventId: "e2",
          occurredAt: new Date(baseTime + 5 * 60_000).toISOString(),
          activityDescription: "debugging an error",
        }),
        // Gap (> 30 min)
        // Episode 2
        makeEvent({
          eventId: "e3",
          occurredAt: new Date(baseTime + 60 * 60_000).toISOString(),
          activityDescription: "writing code again",
        }),
        makeEvent({
          eventId: "e4",
          occurredAt: new Date(baseTime + 65 * 60_000).toISOString(),
          activityDescription: "debugging another error",
        }),
      ];

      const archetypes = graphMapperService.mapToArchetypes(events);
      const patterns = graphMapperService.minePatterns(events, archetypes);

      const matchingPattern = patterns.find(
        (p) => p.taskChain.includes("code_authoring") && p.taskChain.includes("debugging")
      );
      expect(matchingPattern).toBeDefined();
      expect(matchingPattern!.supportCount).toBeGreaterThanOrEqual(2);
    });

    it("ignores single-occurrence chains", () => {
      const baseTime = new Date("2026-03-01T10:00:00Z").getTime();
      const events = [
        makeEvent({
          eventId: "e1",
          occurredAt: new Date(baseTime).toISOString(),
          activityDescription: "writing code",
        }),
        makeEvent({
          eventId: "e2",
          occurredAt: new Date(baseTime + 5 * 60_000).toISOString(),
          activityDescription: "reading email",
        }),
      ];

      const archetypes = graphMapperService.mapToArchetypes(events);
      const patterns = graphMapperService.minePatterns(events, archetypes);
      expect(patterns).toHaveLength(0);
    });

    it("segments by 30-min gap", () => {
      const baseTime = new Date("2026-03-01T10:00:00Z").getTime();
      const events = [
        makeEvent({
          eventId: "e1",
          occurredAt: new Date(baseTime).toISOString(),
          activityDescription: "writing code",
        }),
        // 45 min gap — new episode
        makeEvent({
          eventId: "e2",
          occurredAt: new Date(baseTime + 45 * 60_000).toISOString(),
          activityDescription: "debugging error",
        }),
      ];

      const archetypes = graphMapperService.mapToArchetypes(events);
      const patterns = graphMapperService.minePatterns(events, archetypes);
      // Each episode has only 1 archetype, so chains of length < 2 are skipped
      expect(patterns).toHaveLength(0);
    });

    it("deduplicates consecutive same archetypes", () => {
      const baseTime = new Date("2026-03-01T10:00:00Z").getTime();
      const events = [
        makeEvent({
          eventId: "e1",
          occurredAt: new Date(baseTime).toISOString(),
          activityDescription: "writing code",
        }),
        makeEvent({
          eventId: "e2",
          occurredAt: new Date(baseTime + 2 * 60_000).toISOString(),
          activityDescription: "coding another function",
        }),
        makeEvent({
          eventId: "e3",
          occurredAt: new Date(baseTime + 5 * 60_000).toISOString(),
          activityDescription: "debugging issue",
        }),
        // Repeat pattern in another episode
        makeEvent({
          eventId: "e4",
          occurredAt: new Date(baseTime + 60 * 60_000).toISOString(),
          activityDescription: "implementing feature",
        }),
        makeEvent({
          eventId: "e5",
          occurredAt: new Date(baseTime + 62 * 60_000).toISOString(),
          activityDescription: "coding more stuff",
        }),
        makeEvent({
          eventId: "e6",
          occurredAt: new Date(baseTime + 65 * 60_000).toISOString(),
          activityDescription: "troubleshooting bug",
        }),
      ];

      const archetypes = graphMapperService.mapToArchetypes(events);
      const patterns = graphMapperService.minePatterns(events, archetypes);

      // The chain should be [code_authoring, debugging], not [code_authoring, code_authoring, debugging]
      const pattern = patterns.find((p) => p.taskChain.includes("code_authoring"));
      if (pattern) {
        // Verify consecutive code_authoring entries are collapsed
        for (let i = 1; i < pattern.taskChain.length; i++) {
          if (pattern.taskChain[i] === pattern.taskChain[i - 1]) {
            fail("Consecutive duplicate archetypes should be collapsed");
          }
        }
      }
    });
  });
});
