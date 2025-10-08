import { ReactNode } from "react";
import { useSidebar } from "../../context/SidebarContext";

interface MainContentProps {
  children: ReactNode;
}

export default function MainContent({ children }: MainContentProps) {
  const { isCollapsed } = useSidebar();

  return (
    <main
      className={`flex-1 h-full overflow-auto bg-background-primary transition-spacing duration-300 ${
        isCollapsed ? "ml-0" : "ml-0"
      }`}
    >
      {children}
    </main>
  );
}
