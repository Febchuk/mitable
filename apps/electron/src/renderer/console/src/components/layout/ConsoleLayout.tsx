import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider } from "../../context/SidebarContext";
import Sidebar from "./Sidebar";
import TitleBar from "./TitleBar";
import UpdateBanner from "./UpdateBanner";
import { createLogger } from "../../../../lib/logger";

const logger = createLogger("ConsoleLayout");

// Detect platform for styling
const isMac = navigator.platform.toLowerCase().includes("mac");

export default function ConsoleLayout() {
  const navigate = useNavigate();

  // Listen for drafts navigation requests from IPC (Update Buddy)
  useEffect(() => {
    const handleDraftsNavigate = (draftId: string) => {
      logger.info("Navigating to draft:", draftId);
      navigate(`/drafts/${draftId}`);
    };

    // Register IPC listener
    const unsubscribe = window.consoleAPI?.onDraftsNavigate?.(handleDraftsNavigate);

    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  // macOS: transparent to show vibrancy, Windows: solid background (Mica handles the effect)
  const rootBackground = isMac ? "bg-canvas-base/80" : "bg-canvas-base";

  return (
    <SidebarProvider>
      {/* Root container with noise texture overlay */}
      <div className={`flex flex-col h-screen overflow-hidden ${rootBackground} noise-overlay`}>
        {/* Custom Title Bar - Spans full width */}
        <TitleBar />

        {/* In-app update banner */}
        <UpdateBanner />

        <div className="flex-1 flex min-h-0 overflow-hidden relative">
          <Sidebar />

          {/* Main Content Area - Floating Card Style with ambient glow */}
          <div className="flex-1 min-w-0 flex flex-col h-full pb-3 pr-3 overflow-hidden">
            <div className="flex-1 min-w-0 overflow-hidden rounded-2xl shadow-2xl border border-stroke-subtle bg-canvas-raised relative flex flex-col">
              {/* Ambient glow effect */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-gradient-to-b from-indigo/5 to-transparent pointer-events-none rounded-t-2xl" />

              {/* Content area - uses flex to allow views to control their own height/scrolling */}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
                <Outlet />
              </div>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
