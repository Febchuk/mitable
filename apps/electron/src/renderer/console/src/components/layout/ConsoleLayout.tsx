import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider } from "../../context/SidebarContext";
import { ScrollArea } from "../ui/scroll-area";
import Sidebar from "./Sidebar";

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
      <div className="relative flex h-screen overflow-hidden">
        {/* Invisible draggable overlay at top - allows window dragging */}
        <div
          className="absolute top-0 left-0 right-0 h-10 z-50 pointer-events-auto"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />

        <Sidebar />
        <ScrollArea className="flex-1 bg-background-secondary">
          <Outlet />
        </ScrollArea>
      </div>
    </SidebarProvider>
  );
}
