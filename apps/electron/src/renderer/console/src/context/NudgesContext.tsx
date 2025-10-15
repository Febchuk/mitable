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
      context:
        "Customer (Account #A-4721) claims they were charged $450 for premium feature upgrade without consent. They say they only clicked 'Learn More' but were auto-enrolled. Review shows they completed checkout flow but may have missed confirmation step. Customer has been with us 3+ years, always paid on time. Requesting full refund + 1 month credit.",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
      status: "resolved",
      online: true,
    },
    {
      id: "2",
      expertName: "Mike Rodriguez",
      expertRole: "Customer Success Lead",
      description: "De-escalation strategy for angry customer threatening legal action.",
      context:
        "Enterprise client (TechCorp, $50K/year contract) experiencing 3-day service outage. CEO sent email threatening lawsuit and termination. They have critical Q4 presentation dependent on our platform. Already escalated to engineering but need immediate response strategy. Client has 200+ employees on platform.",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
      status: "resolved",
      online: true,
    },
    {
      id: "3",
      expertName: "Lisa Park",
      expertRole: "Operations Manager",
      description: "Late cancellation fee waiver approval process.",
      context:
        "Customer needs to cancel subscription but missed 30-day notice window by 3 days. They're citing medical emergency (provided hospital documentation). Standard policy is to charge 1-month fee, but this seems like legitimate case for waiver. Account value: $199/month, customer since 2021.",
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
      context:
        "EU customer submitted GDPR Article 17 data deletion request via email. They want all personal data removed within 30-day legal requirement. Account has been inactive for 6 months. Need to confirm: (1) proper identity verification steps, (2) what data we're legally required to retain for tax/audit, (3) how to handle data in backups.",
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
