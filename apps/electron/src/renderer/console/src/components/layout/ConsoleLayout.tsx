import { Outlet } from "react-router-dom";
import { SidebarProvider } from "../../context/SidebarContext";
import { ScrollArea } from "../ui/scroll-area";
import Sidebar from "./Sidebar";

export default function ConsoleLayout() {
  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <ScrollArea className="flex-1 bg-background-secondary">
          <Outlet />
        </ScrollArea>
      </div>
    </SidebarProvider>
  );
}
