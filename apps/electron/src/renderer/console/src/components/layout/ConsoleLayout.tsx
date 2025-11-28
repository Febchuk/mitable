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
        <Sidebar />
        <ScrollArea className="flex-1 bg-background-secondary">
          <Outlet />
        </ScrollArea>
      </div>
    </SidebarProvider>
  );
}
