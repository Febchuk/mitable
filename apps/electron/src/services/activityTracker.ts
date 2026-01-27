import { uIOhook, UiohookKey, UiohookKeyboardEvent } from "uiohook-napi";

export interface IntervalEvidence {
  keyboardEventCount: number;
  copyCount: number;
  pasteCount: number;
  cutCount: number;
  mouseClickCount: number;
  mouseScrollCount: number;
}

export type ActivityEventType =
  | "keyboard"
  | "copy"
  | "paste"
  | "cut"
  | "click"
  | "scroll";

export interface TimestampedActivityEvent {
  type: ActivityEventType;
  timestampUnix: number; // UNIX timestamp (milliseconds) for computation/comparison
  timestampISO: string; // ISO formatted timestamp for human-readable logs
}

export interface TimestampedActivityEvents {
  events: TimestampedActivityEvent[];
}

class ActivityTracker {
  private currentInterval: IntervalEvidence = {
    keyboardEventCount: 0,
    copyCount: 0,
    pasteCount: 0,
    cutCount: 0,
    mouseClickCount: 0,
    mouseScrollCount: 0,
  };

  // Store timestamped events for batch analysis
  private timestampedEvents: TimestampedActivityEvent[] = [];

  private isRunning = false;

  /**
   * Create a timestamped event with both UNIX and ISO timestamps
   */
  private createTimestampedEvent(type: ActivityEventType): TimestampedActivityEvent {
    const timestampUnix = Date.now();
    const timestampISO = new Date(timestampUnix).toISOString();
    return {
      type,
      timestampUnix,
      timestampISO,
    };
  }

  start(): void {
    if (this.isRunning) {
      console.warn("[ActivityTracker] Already running");
      return;
    }

    console.log("[ActivityTracker] Starting activity tracking");

    uIOhook.on("keydown", this.handleKeyDown);
    uIOhook.on("click", this.handleClick);
    uIOhook.on("wheel", this.handleWheel);

    uIOhook.start();
    this.isRunning = true;
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log("[ActivityTracker] Stopping activity tracking");

    // Remove event listeners to prevent memory leaks
    uIOhook.off("keydown", this.handleKeyDown);
    uIOhook.off("click", this.handleClick);
    uIOhook.off("wheel", this.handleWheel);

    uIOhook.stop();
    this.isRunning = false;
  }

  /**
   * Reset interval counters and return evidence
   * Clears both counters AND timestampedEvents
   * Used every 10 seconds in interval mode
   */
  reset(): IntervalEvidence {
    const evidence = { ...this.currentInterval };

    // Log evidence before reset (includes timestamped events count for debugging)
    console.log("[ActivityTracker] 📊 Interval Evidence:", {
      keyboard: evidence.keyboardEventCount,
      copy: evidence.copyCount,
      paste: evidence.pasteCount,
      cut: evidence.cutCount,
      clicks: evidence.mouseClickCount,
      scrolls: evidence.mouseScrollCount,
      timestampedEvents: this.timestampedEvents.length,
    });

    this.currentInterval = {
      keyboardEventCount: 0,
      copyCount: 0,
      pasteCount: 0,
      cutCount: 0,
      mouseClickCount: 0,
      mouseScrollCount: 0,
    };

    // Clear timestamped events (prevents memory leak in interval mode)
    this.timestampedEvents = [];

    return evidence;
  }

  /**
   * Get all timestamped events and clear them
   * Use this for batch collection: get events from last 60 seconds, then clear
   * Returns events sorted by timestamp (oldest first)
   */
  getAndResetTimestampedEvents(): TimestampedActivityEvent[] {
    const events = [...this.timestampedEvents].sort(
      (a, b) => a.timestampUnix - b.timestampUnix
    );
    this.timestampedEvents = [];
    return events;
  }

  private handleKeyDown = (event: UiohookKeyboardEvent): void => {
    this.currentInterval.keyboardEventCount++;
    this.timestampedEvents.push(this.createTimestampedEvent("keyboard"));

    const isCtrlOrCmd = event.ctrlKey || event.metaKey;

    if (isCtrlOrCmd) {
      if (event.keycode === UiohookKey.C) {
        this.currentInterval.copyCount++;
        // Replace the last "keyboard" event with "copy" since it's more specific
        if (this.timestampedEvents.length > 0) {
          this.timestampedEvents[this.timestampedEvents.length - 1] =
            this.createTimestampedEvent("copy");
        }
      } else if (event.keycode === UiohookKey.V) {
        this.currentInterval.pasteCount++;
        // Replace the last "keyboard" event with "paste" since it's more specific
        if (this.timestampedEvents.length > 0) {
          this.timestampedEvents[this.timestampedEvents.length - 1] =
            this.createTimestampedEvent("paste");
        }
      } else if (event.keycode === UiohookKey.X) {
        this.currentInterval.cutCount++;
        // Replace the last "keyboard" event with "cut" since it's more specific
        if (this.timestampedEvents.length > 0) {
          this.timestampedEvents[this.timestampedEvents.length - 1] =
            this.createTimestampedEvent("cut");
        }
      }
    }
  };

  private handleClick = (): void => {
    this.currentInterval.mouseClickCount++;
    this.timestampedEvents.push(this.createTimestampedEvent("click"));
  };

  private handleWheel = (): void => {
    this.currentInterval.mouseScrollCount++;
    this.timestampedEvents.push(this.createTimestampedEvent("scroll"));
  };
}

export const activityTracker = new ActivityTracker();
