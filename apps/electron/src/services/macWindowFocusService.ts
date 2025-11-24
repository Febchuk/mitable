import { execFile } from "node:child_process";
import { promisify } from "node:util";
import activeWin from "active-win";

const execFileAsync = promisify(execFile);

export interface WindowProcessInfo {
  processId?: number;
  appName: string;
  windowTitle: string;
}

export interface ResolvedWindowInfo {
  title: string;
  appName: string;
  url?: string;
}

async function focusAppByProcessId(processId: number): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }

  const script = `
tell application "System Events"
  set frontmost of (first process whose unix id is ${processId}) to true
end tell
`;

  try {
    await execFileAsync("/usr/bin/osascript", ["-e", script]);
    console.log("[MacWindowFocusService] Focused app by processId:", processId);
  } catch (error) {
    console.error(
      "[MacWindowFocusService] Failed to focus app by processId:",
      processId,
      error
    );
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function resolveWindowUrlForWatchSelection(
  windowInfo: WindowProcessInfo
): Promise<ResolvedWindowInfo> {
  const fallback: ResolvedWindowInfo = {
    title: windowInfo.windowTitle,
    appName: windowInfo.appName,
    url: undefined,
  };

  if (process.platform !== "darwin") {
    return fallback;
  }

  if (!windowInfo.processId) {
    console.warn(
      "[MacWindowFocusService] Missing processId for window, falling back to title/app only"
    );
    return fallback;
  }

  try {
    await focusAppByProcessId(windowInfo.processId);

    // Small delay to allow macOS to bring the app to the front
    await delay(200);

    const activeWindow = await activeWin();

    if (!activeWindow) {
      console.warn(
        "[MacWindowFocusService] active-win returned null after focusing app"
      );
      return fallback;
    }

    const activeProcessId = activeWindow.owner?.processId;
    const title = activeWindow.title ?? windowInfo.windowTitle;
    const appName = activeWindow.owner?.name ?? windowInfo.appName;
    const url = (activeWindow as any).url as string | undefined;

    const sameProcess =
      typeof activeProcessId === "number" &&
      activeProcessId === windowInfo.processId;

    if (!sameProcess) {
      console.warn(
        "[MacWindowFocusService] Active window processId mismatch after focus attempt",
        {
          expectedProcessId: windowInfo.processId,
          activeProcessId,
          title,
          appName,
        }
      );
      return {
        title,
        appName,
        url: undefined,
      };
    }

    console.log("[MacWindowFocusService] Resolved active window for watch selection", {
      title,
      appName,
      hasUrl: !!url,
    });

    return {
      title,
      appName,
      url,
    };
  } catch (error) {
    console.error(
      "[MacWindowFocusService] Failed to resolve window URL for watch selection",
      error
    );
    return fallback;
  }
}

