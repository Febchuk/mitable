import { useSidebar } from "../../context/SidebarContext";
import Logo from "../navigation/Logo";
import Nav from "../navigation/Nav";
import CollapseToggle from "../navigation/CollapseToggle";

export default function Sidebar() {
  const { isCollapsed } = useSidebar();

  return (
    <aside
      className={`${
        isCollapsed ? "w-sidebar-collapsed" : "w-sidebar-expanded"
      } h-full bg-background-secondary border-r border-border flex flex-col transition-width duration-300`}
    >
      <Logo />
      <div className="flex-1 overflow-y-auto">
        <Nav />
      </div>
      <CollapseToggle />
    </aside>
  );
}
