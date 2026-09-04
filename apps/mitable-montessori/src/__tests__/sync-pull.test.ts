import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("@/lib/db/schema", () => ({ getDb }));

import { FULL_SYNC_STALE_AFTER_MS, pullSyncIfStale } from "@/lib/sync/pull";

describe("pullSyncIfStale", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getDb.mockReturnValue({
      syncMeta: {
        get: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not re-download a current user's recently refreshed offline cache", async () => {
    const syncMetaGet = vi.fn().mockResolvedValue({ value: new Date().toISOString() });
    getDb.mockReturnValue({ syncMeta: { get: syncMetaGet } });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(pullSyncIfStale({ schoolId: "school-1", userId: "user-1" })).resolves.toBeNull();

    expect(syncMetaGet).toHaveBeenCalledWith("last_pulled_at:school-1:user-1");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("treats an old cache as stale", async () => {
    const syncMetaGet = vi
      .fn()
      .mockResolvedValue({
        value: new Date(Date.now() - FULL_SYNC_STALE_AFTER_MS - 1).toISOString(),
      });
    getDb.mockReturnValue({ syncMeta: { get: syncMetaGet } });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));

    await expect(pullSyncIfStale({ schoolId: "school-2", userId: "user-2" })).rejects.toThrow(
      "Sync pull failed: 401"
    );

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/v1/sync/pull", {
      method: "GET",
      credentials: "include",
    });
  });
});
