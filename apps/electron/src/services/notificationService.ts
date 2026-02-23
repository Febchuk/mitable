/**
 * Centralized Notification Service
 *
 * Replaces scattered `new Notification()` calls with a single service that handles:
 * - OS-level notifications with Notification.isSupported() guard
 * - Deduplication via dedupeKey + 4-hour window
 * - Click handler routing via configurable callback
 * - User preference checks (per-category toggles)
 */

import { Notification } from "electron";
import { createLogger } from "../lib/logger";
import { preferencesService } from "./preferencesService";

const logger = createLogger("NotificationService");

// 4-hour deduplication window
const DEDUPE_WINDOW_MS = 4 * 60 * 60 * 1000;

type NotificationCategory = "update" | "session" | "nudge" | "recap" | "general";

interface NotificationOptions {
  title: string;
  body: string;
  silent?: boolean;
  /** Key for deduplication — same key won't re-notify within 4 hours */
  dedupeKey?: string;
  /** Category for preference check */
  category?: NotificationCategory;
  /** Action ID passed to the click handler */
  clickAction?: string;
}

type ClickHandler = (actionId: string) => void;
type UserIdProvider = () => string | null;

class NotificationService {
  private clickHandler: ClickHandler | null = null;
  private userIdProvider: UserIdProvider | null = null;
  private dedupeMap: Map<string, number> = new Map();

  /**
   * Set the click handler that routes notification clicks to app actions.
   * Called once from main.ts during initialization.
   */
  setClickHandler(handler: ClickHandler): void {
    this.clickHandler = handler;
  }

  /**
   * Set a provider that returns the current userId for preference lookups.
   */
  setUserIdProvider(provider: UserIdProvider): void {
    this.userIdProvider = provider;
  }

  /**
   * Show an OS-level notification with deduplication and preference checks.
   */
  show(options: NotificationOptions): void {
    if (!Notification.isSupported()) {
      logger.warn("Notifications not supported on this platform");
      return;
    }

    // Preference check
    if (options.category && !this.isCategoryEnabled(options.category)) {
      logger.info(
        `Notification suppressed (category "${options.category}" disabled):`,
        options.title
      );
      return;
    }

    // Deduplication check
    if (options.dedupeKey) {
      const lastShown = this.dedupeMap.get(options.dedupeKey);
      if (lastShown && Date.now() - lastShown < DEDUPE_WINDOW_MS) {
        logger.info(`Notification deduplicated (key "${options.dedupeKey}"):`, options.title);
        return;
      }
      this.dedupeMap.set(options.dedupeKey, Date.now());
    }

    const notification = new Notification({
      title: options.title,
      body: options.body,
      silent: options.silent ?? false,
    });

    if (options.clickAction && this.clickHandler) {
      const handler = this.clickHandler;
      const action = options.clickAction;
      notification.on("click", () => handler(action));
    }

    notification.show();
    logger.info("Notification shown:", options.title);
  }

  // --- Convenience methods ---

  notifyUpdateAvailable(version: string): void {
    this.show({
      title: "Update Available",
      body: `Mitable v${version} is available. Click to view details.`,
      category: "update",
      dedupeKey: `update-available-${version}`,
      clickAction: "view-update",
    });
  }

  notifyUpdateDownloaded(version: string): void {
    this.show({
      title: "Update Ready to Install",
      body: `Mitable v${version} has been downloaded. Click to restart and apply.`,
      category: "update",
      dedupeKey: `update-downloaded-${version}`,
      clickAction: "install-update",
    });
  }

  notifySessionStarted(type: "focused" | "passive"): void {
    const label = type === "passive" ? "Passive session" : "Session";
    this.show({
      title: `${label} Started`,
      body: "Your work session is now being tracked",
      category: "session",
      clickAction: "view-active-session",
    });
  }

  notifySessionEnded(): void {
    this.show({
      title: "Session Ended",
      body: "Your work session has ended",
      category: "session",
      clickAction: "focus",
    });
  }

  notifyNudgeReceived(name: string): void {
    this.show({
      title: "New Nudge",
      body: `${name} is available to help`,
      category: "nudge",
      dedupeKey: `nudge-${name}`,
      clickAction: "focus",
    });
  }

  notifyRecapReady(title: string): void {
    this.show({
      title: "Recap Ready",
      body: `Your recap "${title || "Work session"}" is ready to review.`,
      category: "recap",
      clickAction: "view-recap",
    });
  }

  // --- Private helpers ---

  private isCategoryEnabled(category: NotificationCategory): boolean {
    const userId = this.userIdProvider?.() ?? null;
    if (!userId) return true; // No user context — allow notifications

    const prefs = preferencesService.getUserNotificationPreferences(userId);

    switch (category) {
      case "update":
        return prefs.updateNotifications;
      case "session":
        return prefs.sessionNotifications;
      case "nudge":
        return prefs.nudgeNotifications;
      case "recap":
        return prefs.sessionNotifications; // Recaps are session-related
      case "general":
      default:
        return true;
    }
  }
}

// Export singleton
export const notificationService = new NotificationService();
