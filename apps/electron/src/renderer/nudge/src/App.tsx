import { useState, useEffect } from "react";
import { ExpertProfile } from "@mitable/shared";
import ExpertList from "./components/ExpertList";

interface ExpertMatch {
  expert: ExpertProfile;
  matchScore: number;
}

// Mock data based on design
const mockExperts: ExpertMatch[] = [
  {
    expert: {
      id: "1",
      userId: "u1",
      name: "Breanne De Vera",
      email: "breanne@company.com",
      department: "Billing",
      role: "Billing Specialist",
      expertise: ["billing", "payments"],
      responseRate: 0.95,
      helpfulnessRating: 4.8,
      availability: "available",
    },
    matchScore: 0.92,
  },
  {
    expert: {
      id: "2",
      userId: "u2",
      name: "Hamarenoh Goshu",
      email: "hamarenoh@company.com",
      department: "Billing",
      role: "Billing Specialist",
      expertise: ["billing", "invoicing"],
      responseRate: 0.88,
      helpfulnessRating: 4.5,
      availability: "away",
    },
    matchScore: 0.82,
  },
  {
    expert: {
      id: "3",
      userId: "u3",
      name: "Chad Ekong",
      email: "chad@company.com",
      department: "Billing",
      role: "Billing Specialist",
      expertise: ["billing", "accounts"],
      responseRate: 0.92,
      helpfulnessRating: 4.7,
      availability: "busy",
    },
    matchScore: 0.77,
  },
  {
    expert: {
      id: "4",
      userId: "u4",
      name: "Tewo Taiwo",
      email: "tewo@company.com",
      department: "Billing",
      role: "Billing Specialist",
      expertise: ["billing", "reconciliation"],
      responseRate: 0.85,
      helpfulnessRating: 4.3,
      availability: "available",
    },
    matchScore: 0.68,
  },
  {
    expert: {
      id: "5",
      userId: "u5",
      name: "Nailah Kamal",
      email: "nailah@company.com",
      department: "Billing",
      role: "Billing Specialist",
      expertise: ["billing", "disputes"],
      responseRate: 0.78,
      helpfulnessRating: 4.2,
      availability: "offline",
    },
    matchScore: 0.61,
  },
];

declare global {
  interface Window {
    nudgeAPI: {
      onNudgeShow: (callback: (data: unknown) => void) => void;
      accept: (nudgeId: string) => void;
      dismiss: (nudgeId: string) => void;
      setIgnoreMouseEvents: (ignore: boolean) => void;
    };
  }
}

function App() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [experts, setExperts] = useState<ExpertMatch[]>(mockExperts);

  const handleEscalate = (expertId: string) => {
    console.log("Escalating to expert:", expertId);
    // TODO: Implement escalation logic via IPC
  };

  // Listen for expert data from Agent window
  useEffect(() => {
    window.nudgeAPI?.onNudgeShow((data: any) => {
      console.log("[Nudge] Received expert data:", data);

      if (data?.experts && Array.isArray(data.experts)) {
        // Transform backend ExpertMatch to Nudge ExpertMatch format
        const transformedExperts: ExpertMatch[] = data.experts.map((expert: any) => ({
          expert: {
            id: expert.userId,
            userId: expert.userId,
            name: expert.name,
            email: expert.email,
            department: expert.department || "General",
            role: expert.role || "Employee",
            expertise: expert.expertise?.topics || [],
            responseRate: expert.performance?.responseRate || 0,
            helpfulnessRating: expert.performance?.helpfulnessScore || 0,
            availability: expert.availability || "offline",
          },
          matchScore: expert.matchScore,
        }));

        setExperts(transformedExperts);
        console.log("[Nudge] Transformed experts:", transformedExperts);
      }
    });
  }, []);

  const handleMouseEnter = () => {
    window.nudgeAPI?.setIgnoreMouseEvents(false);
  };

  const handleMouseLeave = () => {
    window.nudgeAPI?.setIgnoreMouseEvents(true);
  };

  return (
    <div
      className="w-full h-full flex items-end justify-start p-4"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <ExpertList
        experts={experts}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
        onEscalate={handleEscalate}
      />
    </div>
  );
}

export default App;
