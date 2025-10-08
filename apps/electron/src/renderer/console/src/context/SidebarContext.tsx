import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface SidebarContextType {
  isCollapsed: boolean;
  toggle: () => void;
  expand: () => void;
  collapse: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

const STORAGE_KEY = "sidebar-collapsed";

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "true";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, isCollapsed.toString());
  }, [isCollapsed]);

  const toggle = () => setIsCollapsed((prev) => !prev);
  const expand = () => setIsCollapsed(false);
  const collapse = () => setIsCollapsed(true);

  return (
    <SidebarContext.Provider value={{ isCollapsed, toggle, expand, collapse }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
