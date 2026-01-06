import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import type { SelectedWindowInfo, WatchableWindow } from "@mitable/shared";
import { createLogger } from "../../lib/logger";

const logger = createLogger("EyeDropdownApp");

export default function EyeDropdownApp() {
  const [selectedWindows, setSelectedWindows] = useState<SelectedWindowInfo[]>([]);
  const [availableWindows, setAvailableWindows] = useState<WatchableWindow[]>([]);

  // Listen for data from main process
  useEffect(() => {
    // Skip if preload API not ready
    if (!window.dropdownAPI) {
      logger.warn("dropdownAPI not available");
      return;
    }

    const unsubscribe = window.dropdownAPI.onData((data) => {
      if (data.type === "eye") {
        setSelectedWindows(data.selectedWindows);
        setAvailableWindows(data.availableWindows);
      }
    });

    return unsubscribe;
  }, []);

  const handleSelectWindow = async (windowInfo: WatchableWindow) => {
    await window.dropdownAPI?.action("select-window", {
      windowId: windowInfo.windowId,
      appName: windowInfo.appName,
      windowTitle: windowInfo.windowTitle,
      displayName: windowInfo.displayName,
      tabTitle: windowInfo.tabTitle,
      isBrowser: windowInfo.isBrowser,
    });

    // Update local state optimistically
    setSelectedWindows((prev) => [
      ...prev,
      {
        windowId: windowInfo.windowId,
        appName: windowInfo.appName,
        windowTitle: windowInfo.windowTitle,
        displayName: windowInfo.displayName,
        tabTitle: windowInfo.tabTitle,
        isBrowser: windowInfo.isBrowser,
      },
    ]);
  };

  const handleUnselectWindow = async (windowId: string) => {
    await window.dropdownAPI?.action("unselect-window", windowId);

    // Update local state optimistically
    setSelectedWindows((prev) => prev.filter((w) => w.windowId !== windowId));
  };

  // Filter out already selected and blocked windows
  const unselectedWindows = availableWindows.filter(
    (w) => !w.isBlocked && !selectedWindows.some((s) => s.windowId === w.windowId)
  );

  return (
    <div className="w-full h-full bg-[#2A2A2A] rounded-lg shadow-xl border border-white/10 py-2 overflow-hidden">
      {/* Selected windows section */}
      <div className="px-3 pb-2">
        <div className="text-[10px] text-white/50 mb-1.5">Watching</div>
        {selectedWindows.length === 0 ? (
          <div className="text-xs text-white/30 italic">No windows selected</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {selectedWindows.map((win) => (
              <div
                key={win.windowId}
                className="flex items-center gap-1 bg-primary/20 border border-primary/30 rounded-full pl-2 pr-1 py-0.5"
              >
                <span className="text-[10px] text-white truncate max-w-[120px]">
                  {win.displayName || win.appName}
                </span>
                <button
                  onClick={() => handleUnselectWindow(win.windowId)}
                  className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                >
                  <X size={10} className="text-white/70" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-white/10 mx-2 my-1" />

      {/* Available windows to add */}
      <div className="text-[10px] text-white/50 px-3 py-1">Add Window</div>
      <div className="max-h-[180px] overflow-y-auto custom-scrollbar">
        {unselectedWindows.length === 0 ? (
          <div className="px-3 py-2 text-xs text-white/30">
            {availableWindows.length === 0 ? "No windows available" : "All windows added"}
          </div>
        ) : (
          unselectedWindows.map((windowInfo) => (
            <button
              key={windowInfo.windowId}
              onClick={() => handleSelectWindow(windowInfo)}
              className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-white/5 transition-colors text-left"
            >
              <div className="w-4 h-4 rounded-full border border-white/30 flex items-center justify-center flex-shrink-0 hover:border-primary hover:bg-primary/10">
                <Plus size={10} className="text-white/50" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-white truncate block">
                  {windowInfo.displayName || windowInfo.appName}
                </span>
                {(windowInfo.isBrowser ? windowInfo.tabTitle : windowInfo.windowTitle) && (
                  <span className="text-[10px] text-white/50 truncate block">
                    {windowInfo.isBrowser ? windowInfo.tabTitle : windowInfo.windowTitle}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
