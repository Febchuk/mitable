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
      createNudge: (data: unknown) => void;
      setIgnoreMouseEvents: (ignore: boolean) => void;
      // NEW: Dynamic window resizing
      resizeWindow: (
        options: { width?: number; height?: number } | "collapsed" | "expanded"
      ) => void;
      // NEW: AI generation methods
      generateContext: (conversationId: string) => Promise<{ context: string }>;
      generateQuestion: (conversationId: string) => Promise<{ question: string }>;
    };
  }
}

function App() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [experts, setExperts] = useState<ExpertMatch[]>(mockExperts);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // NEW: Loading and error states for AI generation
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const handleEscalate = async (expertId: string) => {
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
      setGenerationError("No conversation found. Please start a chat first.");
      return;
    }

    // Show loading state and clear any previous errors
    setIsGenerating(true);
    setGenerationError(null);

    try {
      console.log("[Nudge] Generating context and question...");

      // Call both AI generation methods in parallel for faster performance
      const [contextResult, questionResult] = await Promise.all([
        window.nudgeAPI.generateContext(conversationId),
        window.nudgeAPI.generateQuestion(conversationId),
      ]);

      console.log("[Nudge] Generation complete:", {
        contextLength: contextResult.context.length,
        questionLength: questionResult.question.length,
      });

      // Send nudge creation request with AI-generated content
      window.nudgeAPI?.createNudge({
        expert: expertMatch.expert,
        matchScore: expertMatch.matchScore,
        conversationId,
        context: contextResult.context, // NEW: Pre-filled AI context
        question: questionResult.question, // NEW: Pre-filled AI question
      });

      // Success! Clear loading state
      setIsGenerating(false);
    } catch (error) {
      console.error("[Nudge] Generation failed:", error);
      setIsGenerating(false);
      setGenerationError(
        error instanceof Error ? error.message : "Failed to generate content. Please try again."
      );
    }
  };

  // Listen for expert data from Agent window
  useEffect(() => {
    window.nudgeAPI?.onNudgeShow((data: any) => {
      console.log("[Nudge] Received expert data:", data);

      // Store conversationId for context generation
      if (data?.conversationId) {
        setConversationId(data.conversationId);
        console.log("[Nudge] Stored conversationId:", data.conversationId);
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
    <div className="nudge-window-container visible w-full h-full">
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

        {/* Loading Overlay - Shows while AI generates content */}
        {isGenerating && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-[#2a2a2a] rounded-2xl p-6 text-center max-w-sm">
              <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-white font-semibold text-lg">Generating context...</p>
              <p className="text-white/60 text-sm mt-2">This will only take a moment</p>
            </div>
          </div>
        )}

        {/* Error Overlay - Shows if generation fails */}
        {generationError && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-[#2a2a2a] rounded-2xl p-6 text-center max-w-sm">
              <p className="text-red-400 font-semibold text-lg mb-4">Generation Failed</p>
              <p className="text-white/80 text-sm mb-6">{generationError}</p>
              <button
                onClick={() => setGenerationError(null)}
                className="px-6 py-2 bg-white text-black rounded-lg font-medium hover:bg-white/90 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
