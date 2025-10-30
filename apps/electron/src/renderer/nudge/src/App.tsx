import { useState, useEffect } from "react";
import { ExpertProfile, SuggestedNudge } from "@mitable/shared";
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
      createNudge: (data: unknown) => void;
      setIgnoreMouseEvents: (ignore: boolean) => void;
      // Dynamic window resizing
      resizeWindow: (
        options: { width?: number; height?: number } | "collapsed" | "expanded"
      ) => void;
    };
  }
}

function App() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [experts, setExperts] = useState<ExpertMatch[]>(mockExperts);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [suggestedNudge, setSuggestedNudge] = useState<SuggestedNudge | null>(null);

  const handleEscalate = (expertId: string) => {
    console.log("Escalating to expert:", expertId);

    // Find the expert data
    const expertMatch = experts.find((e) => e.expert.id === expertId);
    if (!expertMatch) {
      console.error("Expert not found:", expertId);
      return;
    }

    // Check if we have a conversation ID
    if (!conversationId) {
      console.error("[Nudge] No conversationId available");
      return;
    }

    console.log("[Nudge] Using pre-generated content:", {
      hasContext: !!suggestedNudge?.context,
      hasQuestion: !!suggestedNudge?.question,
      contextLength: suggestedNudge?.context?.length || 0,
      questionLength: suggestedNudge?.question?.length || 0,
    });

    // Send nudge creation request with pre-generated content
    // Fallback to empty strings for manual nudge creation flow
    window.nudgeAPI?.createNudge({
      expert: expertMatch.expert,
      matchScore: expertMatch.matchScore,
      conversationId,
      context: suggestedNudge?.context || "",
      question: suggestedNudge?.question || "",
    });
  };

  // Listen for expert data from Agent window
  useEffect(() => {
    window.nudgeAPI?.onNudgeShow((data: any) => {
      console.log("[Nudge] Received expert data:", data);

      // Store conversationId for reference
      if (data?.conversationId) {
        setConversationId(data.conversationId);
        console.log("[Nudge] Stored conversationId:", data.conversationId);
      }

      // Store suggestedNudge (AI-generated context/question)
      if (data?.suggestedNudge) {
        setSuggestedNudge(data.suggestedNudge);
        console.log("[Nudge] Stored suggestedNudge:", {
          contextLength: data.suggestedNudge.context?.length || 0,
          questionLength: data.suggestedNudge.question?.length || 0,
        });
      } else {
        console.log("[Nudge] No suggestedNudge in data (manual flow)");
        setSuggestedNudge(null);
      }

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

  return (
    <div className="w-full h-full flex items-center justify-center relative">
      <ExpertList
        experts={experts}
        isExpanded={isExpanded}
        onToggle={() => {
          const newExpandedState = !isExpanded;
          setIsExpanded(newExpandedState);

          // Resize window to match panel state (left-to-right expansion)
          window.nudgeAPI.resizeWindow(newExpandedState ? "expanded" : "collapsed");
        }}
        onEscalate={handleEscalate}
      />
    </div>
  );
}

export default App;
