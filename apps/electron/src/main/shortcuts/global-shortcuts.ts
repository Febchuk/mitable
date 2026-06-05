import { globalShortcut } from "electron";
import { ctx } from "../context";
import { consoleLogger } from "../loggers";
import { createLogger } from "../../lib/logger";
import { notificationService } from "../../services/notificationService";
import { startSessionFromMain } from "../session/session-lifecycle";
import {
  createWatchingPillWindow,
  showPillReliably,
  startPillCursorTracking,
  stopPillCursorTracking,
} from "../windows/watching-pill-window";

let shortcutSequence: string[] = [];
let lastShortcutKeyTime = 0;
const SEQUENCE_TIMEOUT_MS = 2000;

export function registerGlobalShortcuts() {
  const shortcutLogger = createLogger("GlobalShortcuts");

  const resetSequenceIfNeeded = () => {
    const now = Date.now();
    if (now - lastShortcutKeyTime > SEQUENCE_TIMEOUT_MS) {
      shortcutSequence = [];
    }
  };

  globalShortcut.register("CommandOrControl+M", async () => {
    resetSequenceIfNeeded();
    lastShortcutKeyTime = Date.now();

    if (shortcutSequence.length === 1 && shortcutSequence[0] === "M") {
      shortcutLogger.info(" Cmd+M+M / Ctrl+M+M detected - starting session");
      shortcutSequence = [];

      try {
        const result = await startSessionFromMain();

        if (result.success) {
          notificationService.notifySessionStarted("focused");
        } else {
          notificationService.show({
            title: "Could not start session",
            body: result.error || "Please try again",
            clickAction: "focus",
          });
        }
      } catch (error) {
        shortcutLogger.error(" Error starting session via shortcut:", error);
      }
    } else {
      shortcutSequence = ["M"];
    }
  });

  globalShortcut.register("CommandOrControl+Shift+U", () => {
    notificationService.show({
      title: "Time to Send an Update",
      body: "Click to open your session and share your progress",
      clickAction: "view-active-session",
    });
  });

  globalShortcut.register("CommandOrControl+Shift+W", () => {
    try {
      if (!ctx.watchingPillWindow || ctx.watchingPillWindow.isDestroyed()) {
        createWatchingPillWindow();
      }

      if (ctx.watchingPillWindow && !ctx.watchingPillWindow.isDestroyed()) {
        if (ctx.watchingPillWindow.isVisible()) {
          stopPillCursorTracking();
          ctx.watchingPillWindow.hide();
        } else {
          showPillReliably(ctx.watchingPillWindow);
          startPillCursorTracking();
        }
      }
    } catch (err) {
      consoleLogger.warn("Watching pill toggle error:", String(err));
    }
  });
}
