/**
 * Auth Middleware Tests
 *
 * Tests requireAuth and optionalAuth Express middleware functions.
 * External dependencies (Supabase auth, Drizzle DB) are mocked so that
 * tests run without a live database or network connection.
 *
 * Coverage goals:
 * - requireAuth: missing header, malformed header, invalid token, valid token,
 *   user not in DB, error path, userId/organizationId assignment
 * - optionalAuth: no header, invalid token (graceful continue), valid token
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Mocks — defined before any imports of the module under test.
// ---------------------------------------------------------------------------

const mockGetUser = jest.fn<any>();

jest.mock("../../shared-infra/lib/supabase.js", () => ({
  supabase: {
    auth: {
      getUser: mockGetUser,
    },
  },
}));

// Each db.select() call goes through the same chain.
// requireAuth makes 3 selects:
//   1. user record:   .select().from(users).where(eq(users.id, ...)).limit(1)
//   2. manager check: .select().from(users).where(eq(users.managerId, ...)).limit(1)
//   3. permissions:   .select().from(userPermissions).where(eq(...))  ← no .limit()
//
// We track calls with a counter so each test can configure what each call returns.
const dbSelectResults: any[][] = [];
let dbSelectCallIndex = 0;

const mockDbSelect = jest.fn<any>().mockImplementation(() => {
  const currentIndex = dbSelectCallIndex++;

  // Build a where-chain that:
  //  - can be awaited directly (no .limit call — permissions query)
  //  - also exposes .limit() for the first two selects
  const whereResult: any = dbSelectResults[currentIndex] ?? [];

  // A thenable that resolves to whereResult when awaited directly
  const whereChain = Object.assign(Promise.resolve(whereResult), {
    limit: jest.fn<any>().mockResolvedValue(whereResult),
  });

  return {
    from: jest.fn<any>().mockReturnValue({
      where: jest.fn<any>().mockReturnValue(whereChain),
    }),
  };
});

jest.mock("../../../db/client.js", () => ({
  db: {
    select: (...args: any[]) => mockDbSelect(...args),
  },
}));

// Mock schema to avoid real imports
jest.mock("../../../db/schema/index.js", () => ({
  users: { id: "id", organizationId: "organizationId", role: "role", managerId: "managerId" },
  userPermissions: { userId: "userId", permission: "permission" },
}));

// Import middleware AFTER mocks
import { requireAuth, optionalAuth } from "./auth.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockResponse() {
  const res = {
    status: jest.fn<any>().mockReturnThis(),
    json: jest.fn<any>().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function makeMockRequest(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

describe("requireAuth", () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn() as unknown as NextFunction;
    dbSelectResults.length = 0;
    dbSelectCallIndex = 0;

    // Default: all db selects return empty arrays
    dbSelectResults[0] = []; // user record
    dbSelectResults[1] = []; // manager check
    dbSelectResults[2] = []; // permissions
  });

  describe("missing or malformed Authorization header", () => {
    it("responds 401 when Authorization header is absent", async () => {
      const req = makeMockRequest();
      const res = makeMockResponse();

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Unauthorized" }));
      expect(next).not.toHaveBeenCalled();
    });

    it("responds 401 when Authorization header does not start with 'Bearer '", async () => {
      const req = makeMockRequest({ authorization: "Basic abc123" });
      const res = makeMockResponse();

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("responds 401 for an empty Bearer token", async () => {
      // Supabase returns an error for empty tokens
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: new Error("invalid JWT"),
      });

      const req = makeMockRequest({ authorization: "Bearer " });
      const res = makeMockResponse();

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("invalid token", () => {
    it("responds 401 when Supabase returns an error", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: new Error("Token has expired"),
      });

      const req = makeMockRequest({ authorization: "Bearer expired-token" });
      const res = makeMockResponse();

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Unauthorized",
          message: "Invalid or expired token",
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("responds 401 when Supabase returns no user without an error", async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });

      const req = makeMockRequest({ authorization: "Bearer ghost-token" });
      const res = makeMockResponse();

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("valid token — user present in Supabase", () => {
    const mockUser = { id: "user-abc", email: "test@example.com" };

    beforeEach(() => {
      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });
    });

    it("calls next() when token is valid", async () => {
      // defaults: all selects return []
      const req = makeMockRequest({ authorization: "Bearer valid-token" });
      const res = makeMockResponse();

      await requireAuth(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("attaches userId to the request object", async () => {
      const req = makeMockRequest({ authorization: "Bearer valid-token" });
      const res = makeMockResponse();

      await requireAuth(req, res, next);

      expect((req as any).userId).toBe(mockUser.id);
    });

    it("attaches the full user object to the request", async () => {
      const req = makeMockRequest({ authorization: "Bearer valid-token" });
      const res = makeMockResponse();

      await requireAuth(req, res, next);

      expect((req as any).user).toEqual(mockUser);
    });

    it("sets organizationId and userRole from DB when user record exists", async () => {
      dbSelectResults[0] = [{ organizationId: "org-xyz", role: "admin" }];
      dbSelectResults[1] = []; // no direct reports
      dbSelectResults[2] = []; // no permissions

      const req = makeMockRequest({ authorization: "Bearer valid-token" });
      const res = makeMockResponse();

      await requireAuth(req, res, next);

      expect((req as any).organizationId).toBe("org-xyz");
      expect((req as any).userRole).toBe("admin");
    });

    it("sets isManager true when user has direct reports", async () => {
      dbSelectResults[0] = [{ organizationId: "org-xyz", role: "member" }];
      dbSelectResults[1] = [{ id: "report-user-1" }]; // has a direct report
      dbSelectResults[2] = [];

      const req = makeMockRequest({ authorization: "Bearer valid-token" });
      const res = makeMockResponse();

      await requireAuth(req, res, next);

      expect((req as any).isManager).toBe(true);
    });

    it("sets isManager false when user has no direct reports", async () => {
      dbSelectResults[0] = [{ organizationId: "org-xyz", role: "member" }];
      dbSelectResults[1] = []; // no direct reports
      dbSelectResults[2] = [];

      const req = makeMockRequest({ authorization: "Bearer valid-token" });
      const res = makeMockResponse();

      await requireAuth(req, res, next);

      expect((req as any).isManager).toBe(false);
    });

    it("populates userPermissions from DB rows", async () => {
      dbSelectResults[0] = [{ organizationId: "org-xyz", role: "member" }];
      dbSelectResults[1] = [];
      dbSelectResults[2] = [{ permission: "view_dashboard" }, { permission: "edit_sessions" }];

      const req = makeMockRequest({ authorization: "Bearer valid-token" });
      const res = makeMockResponse();

      await requireAuth(req, res, next);

      expect((req as any).userPermissions).toEqual(["view_dashboard", "edit_sessions"]);
    });
  });

  describe("error handling", () => {
    it("responds 500 when Supabase throws an unexpected error", async () => {
      mockGetUser.mockRejectedValueOnce(new Error("Network error"));

      const req = makeMockRequest({ authorization: "Bearer some-token" });
      const res = makeMockResponse();

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Internal Server Error" })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// optionalAuth
// ---------------------------------------------------------------------------

describe("optionalAuth", () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn() as unknown as NextFunction;
    dbSelectResults.length = 0;
    dbSelectCallIndex = 0;
  });

  it("calls next() without setting user when no Authorization header is present", async () => {
    const req = makeMockRequest();
    const res = makeMockResponse();

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as any).userId).toBeUndefined();
    expect((req as any).user).toBeUndefined();
  });

  it("calls next() without setting user when Authorization header is not Bearer", async () => {
    const req = makeMockRequest({ authorization: "Basic abc" });
    const res = makeMockResponse();

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as any).userId).toBeUndefined();
  });

  it("sets user info on request when token is valid", async () => {
    const mockUser = { id: "user-opt", email: "opt@example.com" };
    mockGetUser.mockResolvedValueOnce({
      data: { user: mockUser },
      error: null,
    });

    const req = makeMockRequest({ authorization: "Bearer valid-optional-token" });
    const res = makeMockResponse();

    await optionalAuth(req, res, next);

    expect((req as any).userId).toBe(mockUser.id);
    expect((req as any).user).toEqual(mockUser);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("calls next() without error when Supabase returns null user for optional auth", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("bad token"),
    });

    const req = makeMockRequest({ authorization: "Bearer bad-optional-token" });
    const res = makeMockResponse();

    await optionalAuth(req, res, next);

    // Should still proceed — optional auth never blocks
    expect(next).toHaveBeenCalledTimes(1);
    expect((req as any).userId).toBeUndefined();
  });

  it("calls next() even if Supabase throws an exception", async () => {
    mockGetUser.mockRejectedValueOnce(new Error("Network timeout"));

    const req = makeMockRequest({ authorization: "Bearer some-token" });
    const res = makeMockResponse();

    await optionalAuth(req, res, next);

    // optionalAuth swallows errors and continues
    expect(next).toHaveBeenCalledTimes(1);
  });
});
