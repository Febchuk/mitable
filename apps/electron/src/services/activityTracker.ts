import { uIOhook, UiohookKey, UiohookKeyboardEvent } from "uiohook-napi";

export interface IntervalEvidence {
  keyboardEventCount: number;
  copyCount: number;
  pasteCount: number;
  cutCount: number;
  mouseClickCount: number;
  mouseScrollCount: number;
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

  private isRunning = false;

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

  reset(): IntervalEvidence {
    const evidence = { ...this.currentInterval };

    // Log evidence before reset
    console.log("[ActivityTracker] 📊 Interval Evidence:", {
      keyboard: evidence.keyboardEventCount,
      copy: evidence.copyCount,
      paste: evidence.pasteCount,
      cut: evidence.cutCount,
      clicks: evidence.mouseClickCount,
      scrolls: evidence.mouseScrollCount,
    });

    this.currentInterval = {
      keyboardEventCount: 0,
      copyCount: 0,
      pasteCount: 0,
      cutCount: 0,
      mouseClickCount: 0,
      mouseScrollCount: 0,
    };

    return evidence;
  }

  private handleKeyDown = (event: UiohookKeyboardEvent): void => {
    this.currentInterval.keyboardEventCount++;

    const isCtrlOrCmd = event.ctrlKey || event.metaKey;

    if (isCtrlOrCmd) {
      if (event.keycode === UiohookKey.C) {
        this.currentInterval.copyCount++;
      } else if (event.keycode === UiohookKey.V) {
        this.currentInterval.pasteCount++;
      } else if (event.keycode === UiohookKey.X) {
        this.currentInterval.cutCount++;
      }
    }
  };

  private handleClick = (): void => {
    this.currentInterval.mouseClickCount++;
  };

  private handleWheel = (): void => {
    this.currentInterval.mouseScrollCount++;
  };
}

export const activityTracker = new ActivityTracker();
