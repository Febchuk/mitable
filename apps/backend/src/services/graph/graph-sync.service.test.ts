// Mock all external dependencies
jest.mock("../../db/client", () => ({
  db: {
    select: jest.fn().mockReturnThis(),
    selectDistinct: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
    returning: jest.fn().mockResolvedValue([{ id: "run-1" }]),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnValue([]),
  },
}));
jest.mock("../../db/schema/index", () => ({
  monitoringSessions: {
    userId: "userId",
    organizationId: "organizationId",
    updatedAt: "updatedAt",
    id: "id",
  },
  sessionWorkstreams: {
    id: "id",
    updatedAt: "updatedAt",
    sessionId: "sessionId",
    totalDurationMinutes: "totalDurationMinutes",
    category: "category",
  },
  userMemories: { updatedAt: "updatedAt", category: "category" },
  graphSyncRuns: { id: "id" },
  graphSyncWatermarks: { source: "source", watermarkTs: "watermarkTs" },
  workflowVisibilitySnapshots: {},
}));
jest.mock("../../config", () => ({
  config: {
    graph: {
      enabled: true,
      lookbackDays: 30,
      topKFacts: 10,
      uri: "http://localhost:7474",
      database: "neo4j",
      user: "neo4j",
      password: "test",
    },
  },
}));
jest.mock("../../lib/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const mockRunQuery = jest.fn().mockResolvedValue([]);
const mockHealthCheck = jest.fn().mockResolvedValue(true);
jest.mock("./graph-client.service", () => ({
  graphClientService: {
    runQuery: (...args: any[]) => mockRunQuery(...args),
    healthCheck: () => mockHealthCheck(),
    isEnabled: () => true,
  },
}));

jest.mock("./graph-retrieval.service", () => ({
  graphRetrievalService: {
    getUserGraphProfile: jest.fn().mockResolvedValue({
      personKey: "cGVyc29uS2V5",
      orgId: "org-1",
      topTasks: [
        {
          factType: "top_task",
          subject: "user",
          relation: "PERFORMS",
          object: "coding",
          score: 120,
          evidenceCount: 5,
          lastSeenAt: new Date().toISOString(),
        },
      ],
      topApps: [
        {
          factType: "top_app",
          subject: "user",
          relation: "USES_APP",
          object: "VS Code",
          score: 50,
          evidenceCount: 50,
          lastSeenAt: new Date().toISOString(),
        },
      ],
      patterns: [],
      preferences: [
        {
          factType: "style_preference",
          subject: "user",
          relation: "PREFERS",
          object: "summary_style: concise",
          score: 1,
          evidenceCount: 1,
        },
      ],
      domains: [],
      appBehaviors: [],
    }),
  },
}));

jest.mock("./graph-mapper.service", () => ({
  graphMapperService: {
    runPipeline: jest.fn().mockResolvedValue({
      appBehaviors: [
        {
          appName: "VS Code",
          userId: "user-1",
          orgId: "org-1",
          topActivities: ["editing code", "reviewing diff"],
          behaviorStatement: "User primarily uses VS Code for editing code, reviewing diff",
          evidenceCount: 10,
          confidence: 0.75,
        },
      ],
      archetypeMappings: [
        {
          archetypeKey: "code_authoring",
          displayName: "Code Authoring",
          domainKey: "engineering",
          evidenceCount: 8,
          confidence: 0.8,
          sourceActivities: ["writing code"],
        },
      ],
      workflowPatterns: [
        {
          patternKey: "code_authoring -> debugging",
          displayName: "Code Authoring -> Debugging",
          taskChain: ["code_authoring", "debugging"],
          supportCount: 3,
          confidence: 0.3,
          avgDurationMinutes: 25,
        },
      ],
      stats: {
        rawEventCount: 100,
        afterDedupeCount: 80,
        stageTimingsMs: {
          stageA_extractMs: 50,
          stageA_dedupeMs: 5,
          stageB_ms: 10,
          stageC_ms: 15,
          stageD_ms: 20,
        },
      },
    }),
  },
}));

jest.mock("./graph-scoring.service", () => ({
  graphScoringService: {
    computeWeight: jest.fn().mockReturnValue({ weight: 0.7, decayApplied: 1.0 }),
    isStable: jest.fn().mockReturnValue(true),
  },
}));

import { graphSyncService } from "./graph-sync.service";
import { config } from "../../config";
import { db } from "../../db/client";

describe("GraphSyncService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default mock chain for db operations
    (db.selectDistinct as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([{ userId: "user-1", orgId: "org-1" }]),
      }),
    });
    (db.select as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
          groupBy: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
        leftJoin: jest.fn().mockReturnValue({
          where: jest
            .fn()
            .mockResolvedValue([
              { sessionCount: 0, userCount: 0, workstreamCount: 0, totalDurationMinutes: 0 },
            ]),
        }),
        innerJoin: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            groupBy: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      }),
    });
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: "run-1" }]),
        onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
      }),
    });
    (db.update as jest.Mock).mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    });
  });

  describe("runNightlySync", () => {
    it("returns early when graph is disabled", async () => {
      (config as any).graph.enabled = false;
      const result = await graphSyncService.runNightlySync();
      expect(result.success).toBe(true);
      expect(result.syncedUsers).toBe(0);
      expect(mockHealthCheck).not.toHaveBeenCalled();
      (config as any).graph.enabled = true;
    });

    it("fails when health check fails", async () => {
      mockHealthCheck.mockResolvedValueOnce(false);
      const result = await graphSyncService.runNightlySync();
      expect(result.success).toBe(false);
      expect(result.error).toContain("health check");
    });

    it("calls mapper pipeline on successful sync", async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { graphMapperService } = require("./graph-mapper.service");
      const result = await graphSyncService.runNightlySync();
      expect(result.success).toBe(true);
      expect(graphMapperService.runPipeline).toHaveBeenCalled();
    });

    it("uses MERGE (not CREATE) for graph writes", async () => {
      await graphSyncService.runNightlySync();
      // All graph queries should use MERGE
      for (const call of mockRunQuery.mock.calls) {
        const query = call[0] as string;
        expect(query).toContain("MERGE");
        expect(query).not.toContain("CREATE");
      }
    });

    it("includes pipeline stats in result", async () => {
      const result = await graphSyncService.runNightlySync();
      expect(result.syncedAppBehaviors).toBeGreaterThanOrEqual(0);
      expect(result.syncedPatterns).toBeGreaterThanOrEqual(0);
    });
  });
});
