import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider } from "../../context/SidebarContext";
import { ScrollArea } from "../ui/scroll-area";
import Sidebar from "./Sidebar";
import TitleBar from "./TitleBar";
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
    if (window.consoleAPI?.onDraftsNavigate) {
      window.consoleAPI.onDraftsNavigate(handleDraftsNavigate);
    }
  }, [navigate]);

  // macOS: transparent to show vibrancy, Windows: solid background (Mica handles the effect)
  const rootBackground = isMac ? "bg-canvas-base/80" : "bg-canvas-base";

  return (
    <SidebarProvider>
      {/* Root container with noise texture overlay */}
      <div className={`flex flex-col h-screen overflow-hidden ${rootBackground} noise-overlay`}>
        {/* Custom Title Bar - Spans full width */}
        <TitleBar />

        <div className="flex-1 flex overflow-hidden relative">
          <Sidebar />

          {/* Main Content Area - Floating Card Style with ambient glow */}
          <div className="flex-1 flex flex-col h-full pb-3 pr-3 overflow-hidden">
            <div className="flex-1 overflow-hidden rounded-2xl shadow-2xl border border-stroke-subtle bg-canvas-raised relative flex flex-col">
              {/* Ambient glow effect */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-gradient-to-b from-indigo/5 to-transparent pointer-events-none rounded-t-2xl" />

              <ScrollArea className="h-full w-full relative">
                <Outlet />
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
