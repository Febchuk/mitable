import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createLogger } from "../lib/logger";
const execFileAsync = promisify(execFile);
const logger = createLogger("MacWindowFocus");

// Cache the dynamic import of active-win (ESM-only, requires dynamic import from CJS)
let activeWinModule: { default: () => Promise<import("active-win").Result | undefined> } | null =
  null;
async function getActiveWin() {
  if (!activeWinModule) activeWinModule = await import("active-win");
  return activeWinModule.default;
}

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
    logger.info(" Focused app by processId:", processId);
  } catch (error) {
    logger.error(" Failed to focus app by processId:", processId, error);
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
    logger.warn(
      "[MacWindowFocusService] Missing processId for window, falling back to title/app only"
    );
    return fallback;
  }

  try {
    await focusAppByProcessId(windowInfo.processId);

    // Small delay to allow macOS to bring the app to the front
    await delay(200);

    const activeWin = await getActiveWin();
    const activeWindow = await activeWin();

    if (!activeWindow) {
      logger.warn(" active-win returned null after focusing app");
      return fallback;
    }

    const activeProcessId = activeWindow.owner?.processId;
    const title = activeWindow.title ?? windowInfo.windowTitle;
    const appName = activeWindow.owner?.name ?? windowInfo.appName;
    const url = (activeWindow as any).url as string | undefined;

    const sameProcess =
      typeof activeProcessId === "number" && activeProcessId === windowInfo.processId;

    if (!sameProcess) {
      logger.warn(" Active window processId mismatch after focus attempt", {
        expectedProcessId: windowInfo.processId,
        activeProcessId,
        title,
        appName,
      });
      return {
        title,
        appName,
        url: undefined,
      };
    }

    logger.info(" Resolved active window for watch selection", {
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
    logger.error("[MacWindowFocusService] Failed to resolve window URL for watch selection", error);
    return fallback;
  }
}
