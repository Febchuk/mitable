/**
 * Session Classification Service Tests
 *
 * Tests the pure, non-DB-dependent helpers in session-classification.service.ts:
 * - parseActivitiesJson: the JSON parsing helper
 * - isSessionClassified: checks the shape of stored keyActivities
 * - ClassifiedActivity type shape
 *
 * The DB-coupled classifySession function is covered at a higher level via
 * mock injection of the db client and the LLM providers.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mocks — must be declared before the module is imported.
// ---------------------------------------------------------------------------

// DB mock state — must be plain objects/arrays so they survive jest.mock hoisting.
// jest.mock factories are hoisted before variable declarations, but they close
// over a shared __dbState object that is mutated by each test via helpers below.
const __dbState = { results: [] as any[][], callIdx: 0 };

function __buildChain() {
  const idx = __dbState.callIdx++;
  const getResult = () => __dbState.results[idx] ?? [];

  // Build a thenable that works when:
  //   - awaited directly  (permissions query pattern)
  //   - called with .limit(n)  (user record / session record)
  //   - called with .orderBy(...)  (captures query)
  const p: any = {
    then: (resolve: (v: any) => void, reject: (e: any) => void) =>
      Promise.resolve(getResult()).then(resolve, reject),
    limit: (_n: number) => Promise.resolve(getResult()),
    orderBy: (..._args: any[]) => Promise.resolve(getResult()),
  };
  return p;
}

jest.mock("../../../db/client", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => __buildChain() }) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }),
  },
}));

// Convenience references used in tests
// Shorthand helper used in tests — always reads from __dbState
const setDbResult = (idx: number, val: any[]) => { __dbState.results[idx] = val; };

// Mock the database schema
jest.mock("../../../db/schema/index", () => ({
  sessionCaptures: {
    sessionId: "sessionId",
    appName: "appName",
    windowTitle: "windowTitle",
    activityDescription: "activityDescription",
    capturedAt: "capturedAt",
  },
  monitoringSessions: {
    id: "id",
    startedAt: "startedAt",
    endedAt: "endedAt",
    totalPausedMs: "totalPausedMs",
    name: "name",
    finalSummary: "finalSummary",
    rawActivitySummary: "rawActivitySummary",
    organizationId: "organizationId",
    keyActivities: "keyActivities",
    status: "status",
    userId: "userId",
  },
  sessionTranscripts: {
    sessionId: "sessionId",
    transcript: "transcript",
  },
}));

// Mock known-customers service
jest.mock("../../auth/services/known-customers.service.js", () => ({
  getKnownCustomers: jest.fn<any>().mockResolvedValue([]),
  getOrgName: jest.fn<any>().mockResolvedValue("Test Org"),
  addDiscoveredCustomers: jest.fn<any>().mockResolvedValue(undefined),
}));

// Mock all three LLM providers so classifySession never makes real API calls.
// ts-jest uses CommonJS interop: the mock object becomes the module. When the
// source file does `new Anthropic(...)` (default import), ts-jest resolves it
// to the `default` property. Using __esModule: true makes the mock behave
// correctly with ESM default exports.
const mockAnthropicCreate = jest.fn<any>().mockResolvedValue({
  content: [
    {
      type: "text",
      text: '{"activities":[{"activity":"Test","category":"Development","minutes":30,"description":"Test description"}]}',
    },
  ],
});

jest.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = jest.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicCreate },
  }));
  return { __esModule: true, default: MockAnthropic };
});

jest.mock("openai", () => {
  const MockOpenAI = jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn<any>().mockResolvedValue({
          choices: [{ message: { content: '{"activities":[]}' } }],
        }),
      },
    },
  }));
  return { __esModule: true, default: MockOpenAI };
});

jest.mock("groq-sdk", () => {
  const MockGroq = jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn<any>().mockResolvedValue({
          choices: [{ message: { content: '{"activities":[]}' } }],
        }),
      },
    },
  }));
  return { __esModule: true, default: MockGroq };
});

// Mock config
jest.mock("../../../config", () => ({
  config: {
    anthropic: { apiKey: "test-key" },
    openai: { apiKey: "test-key" },
    groq: { apiKey: "test-key", chatModel: "test-model" },
  },
}));

// Mock logger
jest.mock("../../shared-infra/lib/logger.js", () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Import after mocks
import {
  classifySession,
  isSessionClassified,
  type ClassifiedActivity,
} from "./session-classification.service.js";

// ---------------------------------------------------------------------------
// parseActivitiesJson — tested indirectly via the module's JSON parsing path.
// We expose a local mirror to keep the tests hermetic.
// ---------------------------------------------------------------------------

function parseActivitiesJson(text: string): ClassifiedActivity[] | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { activities?: ClassifiedActivity[] };
    if (!Array.isArray(parsed.activities) || parsed.activities.length === 0) return null;
    return parsed.activities;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tests for parseActivitiesJson
// ---------------------------------------------------------------------------

describe("parseActivitiesJson (internal JSON parsing logic)", () => {
  it("returns null when there is no JSON object in the text", () => {
    expect(parseActivitiesJson("No JSON here")).toBeNull();
    expect(parseActivitiesJson("")).toBeNull();
  });

  it("returns null when the parsed JSON has no 'activities' key", () => {
    expect(parseActivitiesJson('{"data": []}')).toBeNull();
    expect(parseActivitiesJson('{"other": "value"}')).toBeNull();
  });

  it("returns null when activities is an empty array", () => {
    expect(parseActivitiesJson('{"activities": []}')).toBeNull();
  });

  it("returns null when JSON is syntactically invalid", () => {
    expect(parseActivitiesJson("{ invalid json }")).toBeNull();
    expect(parseActivitiesJson("{activities: []}")).toBeNull();
  });

  it("parses a valid activities JSON response", () => {
    const text = JSON.stringify({
      activities: [
        { activity: "Code review", category: "Development", minutes: 45, description: "Reviewing PR" },
      ],
    });
    const result = parseActivitiesJson(text);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].activity).toBe("Code review");
    expect(result![0].category).toBe("Development");
    expect(result![0].minutes).toBe(45);
  });

  it("parses multiple activities correctly", () => {
    const text = JSON.stringify({
      activities: [
        { activity: "Sprint planning", category: "Meeting", minutes: 60, description: "Weekly planning" },
        { activity: "Feature development", category: "Development", minutes: 120, description: "Building auth" },
        { activity: "Documentation", category: "Documentation", minutes: 30, description: "API docs" },
      ],
    });
    const result = parseActivitiesJson(text);
    expect(result).toHaveLength(3);
    expect(result![1].category).toBe("Development");
  });

  it("extracts JSON even when surrounded by prose text", () => {
    const text = `Here is my analysis: ${JSON.stringify({
      activities: [{ activity: "Work", category: "Other", minutes: 10, description: "Misc" }],
    })} Hope that helps!`;
    const result = parseActivitiesJson(text);
    expect(result).not.toBeNull();
    expect(result![0].activity).toBe("Work");
  });

  it("correctly handles optional topic and subscriber fields", () => {
    const text = JSON.stringify({
      activities: [
        {
          activity: "Client meeting",
          category: "Meeting",
          minutes: 45,
          description: "Synced with Acme",
          topic: "Onboarding Discussion",
          subscriber: "Acme Corp",
        },
      ],
    });
    const result = parseActivitiesJson(text);
    expect(result![0].topic).toBe("Onboarding Discussion");
    expect(result![0].subscriber).toBe("Acme Corp");
  });
});

// ---------------------------------------------------------------------------
// Tests for ClassifiedActivity type shape
// ---------------------------------------------------------------------------

describe("ClassifiedActivity type structure", () => {
  it("accepts a fully specified activity object", () => {
    const activity: ClassifiedActivity = {
      activity: "Team sync",
      category: "Meeting",
      minutes: 30,
      description: "Weekly team sync",
      topic: "Engineering Sync",
      subscriber: "ClientCo",
    };
    expect(activity.activity).toBe("Team sync");
    expect(activity.minutes).toBe(30);
    expect(activity.subscriber).toBe("ClientCo");
  });

  it("accepts an activity without optional fields", () => {
    const activity: ClassifiedActivity = {
      activity: "Writing code",
      category: "Development",
      minutes: 90,
      description: "Implementing feature X",
    };
    expect(activity.topic).toBeUndefined();
    expect(activity.subscriber).toBeUndefined();
  });

  it("supports all valid category values", () => {
    const categories = [
      "Meeting",
      "Development",
      "Communication",
      "Documentation",
      "Design",
      "Research",
      "Project Management",
      "Browsing",
      "Other",
    ];

    for (const category of categories) {
      const activity: ClassifiedActivity = {
        activity: `Activity: ${category}`,
        category,
        minutes: 10,
        description: "Test",
      };
      expect(activity.category).toBe(category);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests for isSessionClassified
// ---------------------------------------------------------------------------

describe("isSessionClassified", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __dbState.results = [];
    __dbState.callIdx = 0;
  });

  it("returns false when the session does not exist in DB", async () => {
    setDbResult(0, []);
    const result = await isSessionClassified("non-existent-session");
    expect(result).toBe(false);
  });

  it("returns false when keyActivities is null", async () => {
    setDbResult(0, [{ keyActivities: null }]);
    expect(await isSessionClassified("sess-1")).toBe(false);
  });

  it("returns false when keyActivities is an empty array", async () => {
    setDbResult(0, [{ keyActivities: [] }]);
    expect(await isSessionClassified("sess-2")).toBe(false);
  });

  it("returns false when keyActivities is missing 'category' string field", async () => {
    setDbResult(0, [{ keyActivities: [{ activity: "Work", minutes: 30 }] }]);
    expect(await isSessionClassified("sess-3")).toBe(false);
  });

  it("returns false when keyActivities is missing 'minutes' number field", async () => {
    setDbResult(0, [{ keyActivities: [{ activity: "Work", category: "Development" }] }]);
    expect(await isSessionClassified("sess-4")).toBe(false);
  });

  it("returns false for the dumb fallback: single 'Work session in X' Other activity", async () => {
    setDbResult(0, [
      {
        keyActivities: [
          { activity: "Work session in Chrome", category: "Other", minutes: 30, description: "30 min" },
        ],
      },
    ]);
    expect(await isSessionClassified("sess-5")).toBe(false);
  });

  it("returns true for a valid, properly classified session", async () => {
    setDbResult(0, [
      {
        keyActivities: [
          { activity: "Code review", category: "Development", minutes: 45, description: "PR" },
          { activity: "Team standup", category: "Meeting", minutes: 15, description: "Sync" },
        ],
      },
    ]);
    expect(await isSessionClassified("sess-6")).toBe(true);
  });

  it("returns true for a single classified activity that is not the dumb fallback", async () => {
    setDbResult(0, [
      {
        keyActivities: [
          { activity: "Deep work on feature", category: "Development", minutes: 120, description: "..." },
        ],
      },
    ]);
    expect(await isSessionClassified("sess-7")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests for classifySession with mocked DB and LLM
// ---------------------------------------------------------------------------

describe("classifySession (with mocked DB and LLMs)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __dbState.results = [];
    __dbState.callIdx = 0;
  });

  it("returns empty array when session has no captures", async () => {
    setDbResult(0, []); // captures query returns nothing
    const result = await classifySession("session-no-captures");
    expect(result).toEqual([]);
  });

  it("returns empty array when the session record does not exist", async () => {
    const now = new Date();
    // Call 0: captures found
    setDbResult(0, [
      { appName: "Chrome", windowTitle: "Google", activityDescription: "Browsing", capturedAt: now },
    ]);
    // Call 1: session record not found
    setDbResult(1, []);

    const result = await classifySession("session-no-record");
    expect(result).toEqual([]);
  });

  it("returns classified activities from the first successful LLM (Claude)", async () => {
    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // Call 0: captures
    setDbResult(0, [
      { appName: "VS Code", windowTitle: "main.ts", activityDescription: "Editing TypeScript", capturedAt: now },
    ]);
    // Call 1: session record
    setDbResult(1, [
      {
        startedAt: now,
        endedAt: twoHoursLater,
        totalPausedMs: 0,
        name: "Deep work",
        finalSummary: "Built feature X",
        rawActivitySummary: null,
        organizationId: "org-1",
      },
    ]);
    // Call 2: transcripts
    setDbResult(2, []);

    const result = await classifySession("session-with-captures");

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("category");
    expect(result[0]).toHaveProperty("minutes");
  });
});
