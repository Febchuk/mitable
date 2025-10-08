import { createContext, useContext, useState, ReactNode } from "react";
import { Nudge } from "../types";

interface NudgesContextType {
  nudges: Nudge[];
  acceptNudge: (nudgeId: string) => void;
  dismissNudge: (nudgeId: string) => void;
}

const NudgesContext = createContext<NudgesContextType | undefined>(undefined);

export function NudgesProvider({ children }: { children: ReactNode }) {
  const [nudges, setNudges] = useState<Nudge[]>([
    {
      id: "1",
      expertName: "Sarah Chen",
      expertRole: "Senior Frontend Engineer",
      description:
        "I noticed you're working on the authentication flow. I've built similar systems before and would be happy to share some best practices.",
      timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
      status: "waiting",
      online: true,
    },
    {
      id: "2",
      expertName: "Marcus Johnson",
      expertRole: "DevOps Lead",
      description:
        "I see you're setting up CI/CD pipelines. Let me walk you through our deployment process and tooling.",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
      status: "waiting",
      online: true,
    },
    {
      id: "3",
      expertName: "Emily Rodriguez",
      expertRole: "Product Designer",
      description:
        "Welcome to the team! I'd love to give you a tour of our design system and Figma workspace.",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
      status: "resolved",
      online: false,
    },
    {
      id: "4",
      expertName: "David Kim",
      expertRole: "Backend Architect",
      description:
        "I can help you understand our microservices architecture and how the services communicate.",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      status: "waiting",
      online: false,
    },
  ]);

  const acceptNudge = (nudgeId: string) => {
    setNudges((prev) =>
      prev.map((nudge) =>
        nudge.id === nudgeId ? { ...nudge, status: "resolved" as const } : nudge
      )
    );
  };

  const dismissNudge = (nudgeId: string) => {
    setNudges((prev) => prev.filter((nudge) => nudge.id !== nudgeId));
  };

  return (
    <NudgesContext.Provider value={{ nudges, acceptNudge, dismissNudge }}>
      {children}
    </NudgesContext.Provider>
  );
}

export function useNudges() {
  const context = useContext(NudgesContext);
  if (!context) {
    throw new Error("useNudges must be used within NudgesProvider");
  }
  return context;
}
