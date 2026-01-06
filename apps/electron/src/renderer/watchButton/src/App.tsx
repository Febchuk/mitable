import { useState, useEffect } from "react";
import { createLogger } from "../../lib/logger";

const logger = createLogger("WatchButton");

interface ButtonData {
  windowId: string;
  appName: string;
  windowTitle: string;
}

type ButtonStatus = "idle" | "checking" | "blocked" | "selected" | "error";

export default function App() {
  const [data, setData] = useState<ButtonData | null>(null);
  const [status, setStatus] = useState<ButtonStatus>("idle");
  const [blockMessage, setBlockMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Parse query params from URL
    const params = new URLSearchParams(window.location.search);
    const windowId = params.get("windowId");
    const appName = params.get("appName");
    const windowTitle = params.get("windowTitle");

    if (windowId && appName && windowTitle) {
      setData({ windowId, appName, windowTitle });
      logger.info(" Initialized with:", {
        windowId,
        appName,
      });
    } else {
      logger.error(" Missing required query params");
      setStatus("error");
      setBlockMessage("Unable to identify this window. Please try again.");
    }
  }, []);

  const handleClick = async () => {
    if (!data || !window.watchButtonAPI) {
      return;
    }

    if (status === "checking" || status === "blocked") {
      return;
    }

    setStatus("checking");
    setBlockMessage(undefined);

    try {
      logger.info(" Button clicked - selecting window:", {
        windowId: data.windowId,
        appName: data.appName,
      });

      const result = await window.watchButtonAPI.selectWindow({
        windowId: data.windowId,
        appName: data.appName,
        windowTitle: data.windowTitle,
      });

      if (result?.allowed) {
        setStatus("selected");
        // In the allowed case, the main process typically closes this window.
      } else {
        setStatus("blocked");
        setBlockMessage(
          result?.reason || "This window is blocked by your organization's capture policy."
        );
      }
    } catch (error) {
      logger.error(" Failed to select window", error);
      setStatus("error");
      setBlockMessage(
        "Something went wrong while checking this window. Please try again or contact your admin."
      );
    }
  };

  if (!data) return null;

  const isDisabled = status === "checking" || status === "blocked";

  let label = `Watch ${data.appName}`;
  if (status === "checking") {
    label = "Checking policy…";
  } else if (status === "blocked") {
    label = "Blocked - Contact Admin";
  } else if (status === "error") {
    label = "Error - Try again";
  }

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={`
        px-3 py-2 rounded-md text-sm font-medium shadow-lg
        transition-all duration-200 app-no-drag
        ${
          status === "blocked" || status === "error"
            ? "bg-gray-400 text-gray-700 cursor-not-allowed opacity-75"
            : "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer hover:shadow-xl"
        }
      `}
      title={blockMessage || `Click to watch ${data.appName} - ${data.windowTitle}`}
    >
      {label}
    </button>
  );
}
