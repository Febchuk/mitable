import { app, clipboard, ipcMain } from "electron";
import { ctx } from "../context";
import { ipcLogger, updateLogger } from "../loggers";
import { createLogger } from "../../lib/logger";

import { updateService } from "../../services/updateService";
import { monitoringSessionService } from "../../services/monitoringSessionService";
import { prepareForQuitAndInstall } from "../tray/tray";

export function registerUpdateHandlers() {
  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("copy-to-clipboard", (_event, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle("copy-file-to-clipboard", async (_event, filePath: string) => {
    if (process.platform === "win32") {
      const { execSync } = await import("child_process");
      execSync(
        `powershell -NoProfile -Command "Set-Clipboard -Path '${filePath.replace(/'/g, "''")}'"`
      );
      return true;
    }
    // macOS/Linux fallback: copy the text content
    const { promises: fs } = await import("fs");
    const content = await fs.readFile(filePath, "utf-8");
    clipboard.writeText(content);
    return true;
  });

  ipcMain.handle("get-block-export-path", async (_event, sessionId: string) => {
    try {
      const { pgDb } = await import("../../services/on-device");
      return await pgDb.getExportPath(sessionId);
    } catch {
      return null;
    }
  });

  ipcMain.handle("get-block-export-content", async (_event, sessionId: string) => {
    try {
      const { pgDb } = await import("../../services/on-device");
      const filePath = await pgDb.getExportPath(sessionId);
      if (!filePath) return null;
      const { promises: fs } = await import("fs");
      const content = await fs.readFile(filePath, "utf-8");
      return { content, path: filePath };
    } catch {
      return null;
    }
  });

  // ── Local-first data handlers ─────────────────────────────────────────────
  ipcMain.handle("get-local-calendar-days", async (_event, startMs: number, endMs: number) => {
    try {
      const { pgDb } = await import("../../services/on-device");

      const currentUserId =
        ctx.currentUserContext?.userId ||
        (await pgDb.getUserPreference("system", "activeLocalUserId")) ||
        undefined;
      const allSessions = await pgDb.getAllSessionsByDateRange(startMs, endMs);
      const sessions = allSessions.filter((s) => !currentUserId || s.userId === currentUserId);

      // Inject the currently active session (it lives in memory, not yet in SQLite)
      const activeState = monitoringSessionService.getSessionState();
      if (activeState && (activeState.status === "active" || activeState.status === "paused")) {
        const alreadyIncluded = sessions.some((s) => s.id === activeState.id);
        if (!alreadyIncluded) {
          sessions.push({
            id: activeState.id,
            userId: ctx.currentUserContext?.userId ?? "",
            organizationId: ctx.currentUserContext?.organizationId ?? "",
            status: activeState.status,
            sessionType: "focused",
            startedAt: activeState.startedAt ?? Date.now(),
            endedAt: null,
            totalPausedMs: activeState.totalPausedMs ?? 0,
            finalSummary: null,
            sessionGoal: null,
            name: null,
          });
        }
      }

      const dayMap = new Map<string, typeof sessions>();
      for (const session of sessions) {
        const dateKey = new Date(session.startedAt).toLocaleDateString("en-CA");
        if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);
        dayMap.get(dateKey)!.push(session);
      }

      const activityDays = [];
      for (const [dateKey, daySessions] of dayMap) {
        const date = new Date(dateKey + "T00:00:00");
        const workBlocks = [];

        // Lazy-load the duration helpers (same gap-capped active-time definition
        // used by the BlockAggregator) so the live block duration matches the
        // final block duration instead of wall-clock.
        const { captureIntervalDurationMs, captureAppBreakdown } = await import(
          "../../services/on-device/blockAggregator"
        );

        for (const session of daySessions) {
          const story = await pgDb.getStoryForSession(session.id);
          const captures = await pgDb.getCapturesForSession(session.id);

          const startTime = new Date(session.startedAt);
          const endTime = session.endedAt ? new Date(session.endedAt) : null;

          // For active sessions there are no classifications/block boundaries
          // yet, but we still have capture timestamps. Use them with the same
          // 60s gap-cap as the aggregator so the live card never inflates to
          // wall-clock. For ended sessions, fall back to wall-clock minus
          // paused time; the aggregator overwrites this once its pipeline
          // completes, so this only matters as a first-paint estimate.
          const activeDurationMs = captureIntervalDurationMs(captures);
          const wallClockMs =
            (session.endedAt ?? Date.now()) - session.startedAt - session.totalPausedMs;
          const durationMs = session.endedAt ? wallClockMs : Math.min(wallClockMs, activeDurationMs);
          const durationMin = Math.max(1, Math.round(durationMs / 60_000));

          // Per-app minutes: prefer the aggregator's gap-capped version.
          // For a single capture (durationMin would still be 1 from min-floor),
          // attribute that minute to the one app we have data for.
          const appMs = captureAppBreakdown(captures);
          const totalAppMs = Object.values(appMs).reduce((a, b) => a + b, 0);
          const appBreakdown = (() => {
            if (totalAppMs > 0) {
              return Object.entries(appMs)
                .sort((a, b) => b[1] - a[1])
                .map(([appName, ms]) => ({
                  app: appName,
                  minutes: Math.max(1, Math.round(ms / 60_000)),
                  percentage: Math.round((ms / totalAppMs) * 100),
                }));
            }
            if (captures.length > 0) {
              // Single capture / no pairs — attribute the floored minute to the
              // most-recent app seen.
              const last = [...captures].sort((a, b) => a.capturedAt - b.capturedAt).pop()!;
              return [{ app: last.appName, minutes: durationMin, percentage: 100 }];
            }
            return [];
          })();

          let taskBreakdown: Array<{ shortTitle: string; description: string; minutes: number }> =
            [];
          if (story?.tasks) {
            try {
              const parsed = JSON.parse(story.tasks);
              if (Array.isArray(parsed)) taskBreakdown = parsed;
            } catch {
              // malformed JSON — leave empty
            }
          }

          workBlocks.push({
            id: session.id,
            startTime: startTime.toISOString(),
            endTime: endTime?.toISOString() ?? null,
            duration: durationMin,
            idleGapBefore: null,
            summary: story?.narrative ?? session.finalSummary ?? "",
            captures: [],
            appBreakdown,
            taskBreakdown,
            isActive: session.status === "active",
            isFocusedSession: session.sessionType === "focused",
            goal: session.sessionGoal ?? undefined,
            name: session.name ?? undefined,
            status: session.status as string,
            finalSummary: session.finalSummary ?? story?.narrative ?? undefined,
            source: "session",
            exportPath: session.exportPath ?? null,
          });
        }

        const totalWorkTime = workBlocks.reduce((sum, b) => sum + b.duration, 0);
        const allApps = new Map<string, number>();
        for (const block of workBlocks) {
          for (const ab of block.appBreakdown) {
            allApps.set(ab.app, (allApps.get(ab.app) ?? 0) + ab.minutes);
          }
        }

        activityDays.push({
          id: dateKey,
          date: date.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          totalWorkTime,
          workBlocks,
          summary: "",
          topApps: [...allApps.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([appName, minutes]) => ({ app: appName, minutes })),
        });
      }

      return activityDays;
    } catch (err) {
      const errLogger = createLogger("LocalCalendar");
      errLogger.error("get-local-calendar-days failed:", String(err));
      return [];
    }
  });

  ipcMain.handle("get-local-session-detail", async (_event, sessionId: string) => {
    try {
      const { pgDb } = await import("../../services/on-device");
      const session = await pgDb.getMonitoringSession(sessionId);
      if (!session) return null;

      const captures = await pgDb.getCapturesForSession(sessionId);
      const classifications = await pgDb.getClassificationsForSession(sessionId);
      const transcriptions = await pgDb.getTranscriptionsForSession(sessionId);
      const story = await pgDb.getStoryForSession(sessionId);

      return { session, captures, classifications, transcriptions, story };
    } catch {
      return null;
    }
  });

  ipcMain.handle("check-for-updates", async () => {
    updateLogger.info(" Manual check for updates requested");
    await updateService.checkForUpdates();
    return { success: true };
  });

  ipcMain.handle("install-update", () => {
    updateLogger.info(" Install update requested");
    prepareForQuitAndInstall();
    updateService.quitAndInstall();
    return { success: true };
  });

  ipcLogger.info(" Update handlers registered successfully");
}
