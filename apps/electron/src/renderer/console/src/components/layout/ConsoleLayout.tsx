import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import MainContent from "./MainContent";

export default function ConsoleLayout() {
  return (
    <div className="w-full h-full flex flex-col bg-background-primary">
      {/* Draggable Titlebar */}
      <div 
        className="h-8 bg-background-primary border-b border-background-elevated flex items-center px-md"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-xs text-text-tertiary font-semibold">Mitable AI</span>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <MainContent>
          <Outlet />
        </MainContent>
      </div>
    </div>
  );
}
