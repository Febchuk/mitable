import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import MainContent from "./MainContent";

export default function ConsoleLayout() {
  return (
    <div className="w-full h-full flex bg-background-primary">
      <Sidebar />
      <MainContent>
        <Outlet />
      </MainContent>
    </div>
  );
}
