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

  async function resolveExportPath(sessionId: string): Promise<string | null> {
    const { promises: fs } = await import("fs");
    const { localInferenceService, localDb } = await import("../../services/on-device");

    // 1. In-memory cache or persisted DB path
    const cached =
      localInferenceService.getExportPath(sessionId) || localDb.getExportPath(sessionId);
    if (cached) {
      try {
        await fs.access(cached);
        return cached;
      } catch {
        /* file moved/deleted */
      }
    }

    // 2. Scan blockdata for session ID in file content (new blocks)
    try {
      const { app: electronApp } = await import("electron");
      const { join } = await import("path");
      const docsDir = electronApp.getPath("documents");
      const blockdataDir = join(docsDir, "Mitable", "blockdata");

      const dayFolders = await fs.readdir(blockdataDir).catch(() => [] as string[]);
      for (const day of dayFolders.reverse()) {
        const dayPath = join(blockdataDir, day);
        const stat = await fs.stat(dayPath);
        if (!stat.isDirectory()) continue;

        const files = await fs.readdir(dayPath);
        for (const file of files) {
          if (!file.endsWith(".md")) continue;
          const filePath = join(dayPath, file);
          const content = await fs.readFile(filePath, "utf-8");
          if (content.includes(sessionId)) {
            localDb.updateMonitoringSessionExportPath(sessionId, filePath);
            return filePath;
          }
        }
      }

      // 3. Match by session start time against block file time headers (legacy blocks)
      const session = localDb.getMonitoringSession(sessionId);
      if (session?.startedAt) {
        const sessionStart = new Date(session.startedAt);
        const months = [
          "january",
          "february",
          "march",
          "april",
          "may",
          "june",
          "july",
          "august",
          "september",
          "october",
          "november",
          "december",
        ];
        const dayFolder = `${months[sessionStart.getMonth()]}_${sessionStart.getDate()}_${sessionStart.getFullYear()}`;
        const targetDayPath = join(blockdataDir, dayFolder);

        try {
          const files = await fs.readdir(targetDayPath);
          // Format as "H:MM AM/PM" to match the block header format
          const sessionHour = sessionStart.getHours();
          const sessionMin = sessionStart.getMinutes();
          const ampm = sessionHour >= 12 ? "PM" : "AM";
          const h12 = sessionHour % 12 || 12;
          const sessionTimeStr = `${h12}:${String(sessionMin).padStart(2, "0")} ${ampm}`;

          for (const file of files) {
            if (!file.endsWith(".md")) continue;
            const filePath = join(targetDayPath, file);
            const content = await fs.readFile(filePath, "utf-8");
            const timeMatch = content.match(/\*\*Time:\*\*\s*(.+?)\s*[–—-]/);
            if (timeMatch) {
              const fileStartTime = timeMatch[1].trim();
              if (fileStartTime === sessionTimeStr) {
                localDb.updateMonitoringSessionExportPath(sessionId, filePath);
                return filePath;
              }
            }
          }

          // Fuzzy match: allow +/- 2 minute drift between session start and first capture
          for (const file of files) {
            if (!file.endsWith(".md")) continue;
            const filePath = join(targetDayPath, file);
            const content = await fs.readFile(filePath, "utf-8");
            const timeMatch = content.match(/\*\*Time:\*\*\s*(\d{1,2}):(\d{2})\s*(AM|PM)/);
            if (timeMatch) {
              let fileH = parseInt(timeMatch[1], 10);
              const fileM = parseInt(timeMatch[2], 10);
              const fileAmpm = timeMatch[3];
              if (fileAmpm === "PM" && fileH !== 12) fileH += 12;
              if (fileAmpm === "AM" && fileH === 12) fileH = 0;
              const fileMins = fileH * 60 + fileM;
              const sessionMins = sessionStart.getHours() * 60 + sessionStart.getMinutes();
              if (Math.abs(fileMins - sessionMins) <= 2) {
                localDb.updateMonitoringSessionExportPath(sessionId, filePath);
                return filePath;
              }
            }
          }
        } catch {
          /* day folder doesn't exist */
        }
      }
    } catch {
      /* scan failed */
    }

    return null;
  }

  ipcMain.handle("get-block-export-path", async (_event, sessionId: string) => {
    try {
      return await resolveExportPath(sessionId);
    } catch {
      return null;
    }
  });

  ipcMain.handle("get-block-export-content", async (_event, sessionId: string) => {
    try {
      const filePath = await resolveExportPath(sessionId);
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
      const { localDb } = await import("../../services/on-device");

      const currentUserId =
        ctx.currentUserContext?.userId ||
        localDb.getUserPreference("system", "activeLocalUserId") ||
        undefined;
      const sessions = localDb
        .getAllSessionsByDateRange(startMs, endMs)
        .filter((s) => !currentUserId || s.userId === currentUserId);

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

        for (const session of daySessions) {
          const story = localDb.getStoryForSession(session.id);
          const captures = localDb.getCapturesForSession(session.id);

          const startTime = new Date(session.startedAt);
          const endTime = session.endedAt ? new Date(session.endedAt) : null;
          const durationMs =
            (session.endedAt ?? Date.now()) - session.startedAt - session.totalPausedMs;
          const durationMin = Math.round(durationMs / 60_000);

          const appCounts = new Map<string, number>();
          for (const cap of captures) {
            appCounts.set(cap.appName, (appCounts.get(cap.appName) ?? 0) + 1);
          }
          const totalCaps = captures.length || 1;
          const appBreakdown = [...appCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([appName, count]) => ({
              app: appName,
              minutes: Math.round((count / totalCaps) * durationMin),
              percentage: Math.round((count / totalCaps) * 100),
            }));

          workBlocks.push({
            id: session.id,
            startTime: startTime.toISOString(),
            endTime: endTime?.toISOString() ?? null,
            duration: durationMin,
            idleGapBefore: null,
            summary: story?.narrative ?? session.finalSummary ?? "",
            captures: [],
            appBreakdown,
            taskBreakdown: [],
            isActive: session.status === "active",
            isFocusedSession: session.sessionType === "focused",
            goal: session.sessionGoal ?? undefined,
            name: session.name ?? undefined,
            status: session.status as string,
            finalSummary: session.finalSummary ?? story?.narrative ?? undefined,
            source: "session",
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
      const { localDb } = await import("../../services/on-device");
      const session = localDb.getMonitoringSession(sessionId);
      if (!session) return null;

      const captures = localDb.getCapturesForSession(sessionId);
      const classifications = localDb.getClassificationsForSession(sessionId);
      const transcriptions = localDb.getTranscriptionsForSession(sessionId);
      const story = localDb.getStoryForSession(sessionId);

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
