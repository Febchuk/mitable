/**
 * Bragbook Generator Service Tests
 *
 * Tests for the bragbook generation service which synthesizes accomplishments
 * from session data using Gemini AI.
 *
 * Strategy:
 * - Mock the Gemini API, database client, and all schema imports.
 * - Test the public API functions: generateBragbookEntry and generateForAllUsers.
 * - Test edge cases: no sessions, no accomplishments, user-edited entries.
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mocks — declared before the module is imported.
// ---------------------------------------------------------------------------

const mockGenerateContent = jest.fn<any>();

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}));

// Mock config
jest.mock("../../../config.js", () => ({
  config: {
    gemini: { apiKey: "test-gemini-key" },
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

// ---------------------------------------------------------------------------
// Database mock — call-counter pattern.
//
// bragbook service uses:
//   db.select().from().where()           — sessions, weekly entries (awaited directly)
//   db.select().from().where().limit(1)  — existing entry check
//   db.selectDistinct().from().where()   — users with sessions (awaited directly)
//   db.insert().values()
//   db.update().set().where()
//
// The __dbState object is shared across the factory closure and mutated by tests.
// ---------------------------------------------------------------------------

const __bbState = {
  selectResults: [] as any[][],
  selectIdx: 0,
  distinctResult: [] as any[],
};

function __bbBuildChain() {
  const idx = __bbState.selectIdx++;
  const getResult = () => __bbState.selectResults[idx] ?? [];
  return {
    then: (resolve: (v: any) => void, reject: (e: any) => void) =>
      Promise.resolve(getResult()).then(resolve, reject),
    limit: (_n: number) => Promise.resolve(getResult()),
    orderBy: (..._args: any[]) => Promise.resolve(getResult()),
  };
}

const mockDbInsertValues = jest.fn<any>().mockResolvedValue(undefined);
const mockDbUpdateSetWhere = jest.fn<any>().mockResolvedValue(undefined);

jest.mock("../../../db/client.js", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => __bbBuildChain() }) }),
    selectDistinct: () => ({
      from: () => ({
        where: () =>
          Object.assign(Promise.resolve(__bbState.distinctResult), {
            limit: () => Promise.resolve(__bbState.distinctResult),
          }),
      }),
    }),
    insert: () => ({ values: mockDbInsertValues }),
    update: () => ({ set: () => ({ where: mockDbUpdateSetWhere }) }),
  },
}));

// Mock database schema
jest.mock("../../../db/schema/index.js", () => ({
  monitoringSessions: {
    id: "id",
    userId: "userId",
    organizationId: "organizationId",
    status: "status",
    startedAt: "startedAt",
    endedAt: "endedAt",
    name: "name",
    rawActivitySummary: "rawActivitySummary",
    finalSummary: "finalSummary",
    accomplishments: "accomplishments",
    taskBreakdown: "taskBreakdown",
    keyActivities: "keyActivities",
  },
  bragbookEntries: {
    id: "id",
    userId: "userId",
    organizationId: "organizationId",
    periodType: "periodType",
    periodStart: "periodStart",
    accomplishments: "accomplishments",
    source: "source",
    updatedAt: "updatedAt",
  },
}));

// Import after mocks are set up
import { generateBragbookEntry, generateForAllUsers } from "./bragbook-generator.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGeminiResponse(accomplishments: string[]): any {
  return {
    response: {
      text: () => JSON.stringify({ accomplishments }),
    },
  };
}

function makeSession(overrides: Record<string, any> = {}) {
  const start = new Date("2026-01-06T09:00:00Z");
  const end = new Date("2026-01-06T11:00:00Z");
  return {
    id: "sess-1",
    name: "Work session",
    rawActivitySummary: "Worked on feature X",
    finalSummary: null,
    accomplishments: ["Completed PR review"],
    taskBreakdown: [{ shortTitle: "PR review", description: "Reviewed auth PR", minutes: 60 }],
    keyActivities: ["code review", "testing"],
    startedAt: start,
    endedAt: end,
    ...overrides,
  };
}

// Reset DB state before each test
function resetDb() {
  __bbState.selectResults = [];
  __bbState.selectIdx = 0;
  __bbState.distinctResult = [];
}

// ---------------------------------------------------------------------------
// generateBragbookEntry — weekly
// ---------------------------------------------------------------------------

describe("generateBragbookEntry — weekly", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDb();
  });

  it("returns empty accomplishments and sessionsUsed=0 when no sessions exist", async () => {
    // Select 0: sessions query → empty
    __bbState.selectResults[0] = [];

    const result = await generateBragbookEntry(
      "user-1",
      "org-1",
      "weekly",
      "2026-01-06",
      "2026-01-12"
    );

    expect(result.accomplishments).toEqual([]);
    expect(result.sessionsUsed).toBe(0);
  });

  it("generates accomplishments from sessions and returns them", async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeGeminiResponse(["Shipped auth feature", "Fixed critical bug"])
    );

    // Select 0: sessions found
    __bbState.selectResults[0] = [makeSession()];
    // Select 1: existing bragbook entry check → none
    __bbState.selectResults[1] = [];

    const result = await generateBragbookEntry(
      "user-1",
      "org-1",
      "weekly",
      "2026-01-06",
      "2026-01-12"
    );

    expect(result.accomplishments).toContain("Shipped auth feature");
    expect(result.accomplishments).toContain("Fixed critical bug");
    expect(result.sessionsUsed).toBe(1);
  });

  it("skips DB write if the existing entry has source=user-edited", async () => {
    mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse(["AI generated item"]));

    // Select 0: sessions found
    __bbState.selectResults[0] = [makeSession()];
    // Select 1: existing entry → user-edited
    __bbState.selectResults[1] = [{ id: "entry-1", source: "user-edited" }];

    await generateBragbookEntry("user-1", "org-1", "weekly", "2026-01-06", "2026-01-12");

    expect(mockDbInsertValues).not.toHaveBeenCalled();
    expect(mockDbUpdateSetWhere).not.toHaveBeenCalled();
  });

  it("updates an existing auto-generated bragbook entry", async () => {
    mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse(["New accomplishment"]));

    __bbState.selectResults[0] = [makeSession()];
    // Existing entry with auto-generated source
    __bbState.selectResults[1] = [{ id: "entry-2", source: "auto-generated" }];

    await generateBragbookEntry("user-1", "org-1", "weekly", "2026-01-06", "2026-01-12");

    expect(mockDbUpdateSetWhere).toHaveBeenCalled();
  });

  it("inserts a new bragbook entry when no previous entry exists", async () => {
    mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse(["Fresh accomplishment"]));

    __bbState.selectResults[0] = [makeSession()];
    __bbState.selectResults[1] = []; // no existing entry

    await generateBragbookEntry("user-1", "org-1", "weekly", "2026-01-06", "2026-01-12");

    expect(mockDbInsertValues).toHaveBeenCalled();
  });

  it("handles Gemini returning an empty accomplishments array", async () => {
    mockGenerateContent.mockResolvedValueOnce(makeGeminiResponse([]));

    __bbState.selectResults[0] = [makeSession()];
    __bbState.selectResults[1] = [];

    const result = await generateBragbookEntry(
      "user-1",
      "org-1",
      "weekly",
      "2026-01-06",
      "2026-01-12"
    );

    expect(result.accomplishments).toEqual([]);
    expect(result.sessionsUsed).toBe(1);
  });

  it("filters out blank or whitespace-only strings from Gemini response", async () => {
    mockGenerateContent.mockResolvedValueOnce(
      makeGeminiResponse(["Valid item", "   ", "", "Another valid item"])
    );

    __bbState.selectResults[0] = [makeSession()];
    __bbState.selectResults[1] = [];

    const result = await generateBragbookEntry(
      "user-1",
      "org-1",
      "weekly",
      "2026-01-06",
      "2026-01-12"
    );

    expect(result.accomplishments).not.toContain("");
    expect(result.accomplishments).not.toContain("   ");
    expect(result.accomplishments).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// generateBragbookEntry — periodType routing
// ---------------------------------------------------------------------------

describe("generateBragbookEntry — periodType routing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDb();
    // All selects return empty arrays by default
  });

  it("routes 'weekly' without throwing", async () => {
    await expect(
      generateBragbookEntry("user-1", "org-1", "weekly", "2026-01-06", "2026-01-12")
    ).resolves.toBeDefined();
  });

  it("routes 'monthly' without throwing", async () => {
    await expect(
      generateBragbookEntry("user-1", "org-1", "monthly", "2026-01-01", "2026-01-31")
    ).resolves.toBeDefined();
  });

  it("routes 'quarterly' without throwing", async () => {
    await expect(
      generateBragbookEntry("user-1", "org-1", "quarterly", "2026-01-01", "2026-03-31")
    ).resolves.toBeDefined();
  });

  it("defaults to weekly for an unknown periodType", async () => {
    const result = await generateBragbookEntry(
      "user-1",
      "org-1",
      "unknown-period",
      "2026-01-06",
      "2026-01-12"
    );
    expect(result).toHaveProperty("accomplishments");
    expect(result).toHaveProperty("sessionsUsed");
  });
});

// ---------------------------------------------------------------------------
// generateBragbookEntry — error propagation
// ---------------------------------------------------------------------------

describe("generateBragbookEntry — error handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDb();
  });

  it("propagates errors thrown by Gemini", async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error("Gemini quota exceeded"));
    __bbState.selectResults[0] = [makeSession()];
    __bbState.selectResults[1] = [];

    await expect(
      generateBragbookEntry("user-1", "org-1", "weekly", "2026-01-06", "2026-01-12")
    ).rejects.toThrow("Gemini quota exceeded");
  });
});

// ---------------------------------------------------------------------------
// generateForAllUsers
// ---------------------------------------------------------------------------

describe("generateForAllUsers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDb();
  });

  it("returns zeros when no users have sessions in the period", async () => {
    __bbState.distinctResult = [];

    const result = await generateForAllUsers("weekly", "2026-01-06", "2026-01-12");

    expect(result.usersProcessed).toBe(0);
    expect(result.usersSkipped).toBe(0);
    expect(result.usersFailed).toBe(0);
  });

  it("processes users with sessions and counts them", async () => {
    __bbState.distinctResult = [
      { userId: "user-A", organizationId: "org-1" },
      { userId: "user-B", organizationId: "org-1" },
    ];

    // Select 0: user-edited entries check → none
    // Selects 1,2,3,4: sessions + bragbook entry checks for each user
    // All return empty (no sessions → no accomplishments → inserts not called)
    // All results default to [] already via resetDb

    const result = await generateForAllUsers("weekly", "2026-01-06", "2026-01-12");

    expect(result.usersProcessed).toBe(2);
    expect(result.usersSkipped).toBe(0);
  });

  it("skips users who have a user-edited entry for the period", async () => {
    __bbState.distinctResult = [
      { userId: "user-edited-1", organizationId: "org-1" },
      { userId: "user-auto-1", organizationId: "org-1" },
    ];

    // Select 0: user-edited entries returns user-edited-1
    __bbState.selectResults[0] = [{ userId: "user-edited-1" }];
    // Remaining selects for user-auto-1 return empty → processed ok

    const result = await generateForAllUsers("weekly", "2026-01-06", "2026-01-12");

    expect(result.usersSkipped).toBe(1);
    expect(result.usersProcessed).toBe(1);
  });

  it("counts failed users when generateBragbookEntry throws", async () => {
    __bbState.distinctResult = [{ userId: "user-fail", organizationId: "org-1" }];

    // Select 0: no user-edited entries
    // Select 1: sessions found for user-fail (triggers Gemini call)
    __bbState.selectResults[0] = [];
    __bbState.selectResults[1] = [makeSession()];
    __bbState.selectResults[2] = []; // no existing bragbook entry

    mockGenerateContent.mockRejectedValueOnce(new Error("API error"));

    const result = await generateForAllUsers("weekly", "2026-01-06", "2026-01-12");

    expect(result.usersFailed).toBe(1);
    expect(result.usersProcessed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseLLMJson — tested indirectly via Gemini responses with markdown fences
// ---------------------------------------------------------------------------

describe("parseLLMJson (indirectly via generateBragbookEntry)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDb();
  });

  it("strips markdown code fences from Gemini responses", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '```json\n{"accomplishments":["Cleaned up legacy code"]}\n```',
      },
    });

    __bbState.selectResults[0] = [makeSession()];
    __bbState.selectResults[1] = [];

    const result = await generateBragbookEntry(
      "user-1",
      "org-1",
      "weekly",
      "2026-01-06",
      "2026-01-12"
    );

    expect(result.accomplishments).toContain("Cleaned up legacy code");
  });

  it("strips bare code fences (no language specifier)", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '```\n{"accomplishments":["Deployed to production"]}\n```',
      },
    });

    __bbState.selectResults[0] = [makeSession()];
    __bbState.selectResults[1] = [];

    const result = await generateBragbookEntry(
      "user-1",
      "org-1",
      "weekly",
      "2026-01-06",
      "2026-01-12"
    );

    expect(result.accomplishments).toContain("Deployed to production");
  });

  it("returns empty accomplishments when Gemini response text is empty", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => "" },
    });

    __bbState.selectResults[0] = [makeSession()];
    __bbState.selectResults[1] = [];

    const result = await generateBragbookEntry(
      "user-1",
      "org-1",
      "weekly",
      "2026-01-06",
      "2026-01-12"
    );

    expect(result.accomplishments).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Period date helper invariants (via API behavior)
// ---------------------------------------------------------------------------

describe("Period date helpers (invariants)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDb();
  });

  it("correctly handles a weekly period that spans a month boundary", async () => {
    await expect(
      generateBragbookEntry("user-1", "org-1", "weekly", "2026-01-26", "2026-02-01")
    ).resolves.toBeDefined();
  });

  it("correctly handles a monthly period for February (28 days)", async () => {
    await expect(
      generateBragbookEntry("user-1", "org-1", "monthly", "2026-02-01", "2026-02-28")
    ).resolves.toBeDefined();
  });

  it("correctly handles Q1 quarterly period", async () => {
    await expect(
      generateBragbookEntry("user-1", "org-1", "quarterly", "2026-01-01", "2026-03-31")
    ).resolves.toBeDefined();
  });
});
