import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider } from "../../context/SidebarContext";
import { ScrollArea } from "../ui/scroll-area";
import Sidebar from "./Sidebar";
import TitleBar from "./TitleBar";
import { UpdateBanner } from "../shared/UpdateBanner";

// Detect platform for styling
const isMac = navigator.platform.toLowerCase().includes("mac");

export default function ConsoleLayout() {
  const navigate = useNavigate();

  // Listen for drafts navigation requests from IPC (Update Buddy)
  useEffect(() => {
    const handleDraftsNavigate = (draftId: string) => {
      console.log("[ConsoleLayout] Navigating to draft:", draftId);
      navigate(`/drafts/${draftId}`);
    };

    // Register IPC listener
    if (window.consoleAPI?.onDraftsNavigate) {
      window.consoleAPI.onDraftsNavigate(handleDraftsNavigate);
    }
  }, [navigate]);

  // macOS: transparent to show vibrancy, Windows: solid background (Mica handles the effect)
  const rootBackground = isMac ? "bg-black/20" : "bg-[#1a1a1a]";

  return (
    <SidebarProvider>
      {/* Root container - transparent on macOS for vibrancy, solid on Windows for Mica */}
      <div className={`flex flex-col h-screen overflow-hidden ${rootBackground}`}>
        {/* Custom Title Bar - Spans full width */}
        <TitleBar />

        <div className="flex-1 flex overflow-hidden relative">
          <Sidebar />

          {/* Main Content Area - Floating Card Style */}
          <div className="flex-1 flex flex-col h-full pb-3 pr-3 overflow-hidden">
            <div className="flex-1 overflow-hidden rounded-2xl shadow-2xl border border-white/5 bg-background-primary backdrop-blur-sm relative flex flex-col">
              <UpdateBanner />
              <ScrollArea className="h-full w-full">
                <Outlet />
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
