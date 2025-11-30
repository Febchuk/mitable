import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider } from "../../context/SidebarContext";
import { ScrollArea } from "../ui/scroll-area";
import Sidebar from "./Sidebar";
import TitleBar from "./TitleBar";

export default function ConsoleLayout() {
  const navigate = useNavigate();

  // Listen for nudge creation requests from IPC
  useEffect(() => {
    const handleNudgeOpenCreator = (data: unknown) => {
      console.log("[ConsoleLayout] Received nudge creation request:", data);

      // Navigate to create nudge page with expert data in state
      navigate("/nudges/new", {
        state: data,
        replace: false,
      });
    };

    // Register IPC listener
    if (window.consoleAPI?.onNudgeOpenCreator) {
      window.consoleAPI.onNudgeOpenCreator(handleNudgeOpenCreator);
    }
  }, [navigate]);

  return (
    <SidebarProvider>
      {/* Root container with transparent background to let Electron vibrancy show through */}
      <div className="flex flex-col h-screen overflow-hidden bg-black/20">
        {/* Custom Title Bar - Spans full width */}
        <TitleBar />

        <div className="flex-1 flex overflow-hidden relative">
          <Sidebar />

          {/* Main Content Area - Floating Card Style */}
          <div className="flex-1 flex flex-col h-full pb-3 pr-3 overflow-hidden">
            <div className="flex-1 overflow-hidden rounded-2xl shadow-2xl border border-white/5 bg-background-primary backdrop-blur-sm relative">
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
