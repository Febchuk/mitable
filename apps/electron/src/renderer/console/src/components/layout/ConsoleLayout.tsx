import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import Sidebar from "./Sidebar";

export default function ConsoleLayout() {
  return (
    <SidebarProvider>
      <Sidebar />
      <SidebarInset className="bg-background-secondary">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
