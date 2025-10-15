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
      expertRole: "Senior Billing Specialist",
      description: "Billing dispute over $450 premium feature change.",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
      status: "resolved",
      online: true,
    },
    {
      id: "2",
      expertName: "Mike Rodriguez",
      expertRole: "Customer Success Lead",
      description: "De-escalation strategy for angry customer threatening legal action.",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
      status: "resolved",
      online: true,
    },
    {
      id: "3",
      expertName: "Lisa Park",
      expertRole: "Operations Manager",
      description: "Late cancellation fee waiver approval process.",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago (Yesterday)
      status: "resolved",
      online: true,
    },
    {
      id: "4",
      expertName: "James Wilson",
      expertRole: "Technical Support Lead",
      description: "Account merge system error 4402 - known bug?",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
      status: "waiting",
      online: false,
    },
    {
      id: "5",
      expertName: "Tatsunosuke Hanano",
      expertRole: "Product Specialist",
      description: "How to use new refund dashboard for international customers.",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4), // 4 days ago
      status: "waiting",
      online: true,
    },
    {
      id: "6",
      expertName: "David Martinez",
      expertRole: "Compliance Manager",
      description: "GDPR data deletion request - proper handling procedure",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7), // 1 week ago
      status: "resolved",
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
