import { createContext, useContext, useState, ReactNode } from "react";

interface SidebarContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);

  const toggle = () => setOpen((prev) => !prev);

  return (
    <SidebarContext.Provider value={{ open, setOpen, toggle }}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
