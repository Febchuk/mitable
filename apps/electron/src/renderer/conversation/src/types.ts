// Type definitions for Conversation window

export interface ExpertMatch {
  expert: {
    id: string;
    userId: string;
    name: string;
    email: string;
    department: string;
    role: string;
    expertise: string[];
    avatarUrl?: string;
    responseRate: number;
    helpfulnessRating: number;
    availability: "available" | "away" | "busy" | "offline";
  };
  matchScore: number;
  expertise: {
    topics: string[];
  };
  performance: {
    responseRate: number;
    helpfulnessScore: number;
  };
}

export interface SuggestedNudge {
  context: string; // 300-word summary
  question: string; // 1-2 sentence question
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "card";
  messageType?: "text" | "workflow" | "experts";
  workflowSessionId?: string | null; // Links to workflow session
  relatedStepIndex?: number | null; // Which step this message relates to
  cardData?: {
    // For workflow messages
    solution?: string;
    workflowSessionId?: string; // Session ID in cardData
    currentStepIndex?: number; // Current step index in cardData
    stepList?: any[];
    workflowActive?: boolean;
    currentPhase?: string;

    // For experts messages
    experts?: ExpertMatch[];
    suggestedNudge?: SuggestedNudge;
  };
  sources?: any[];
  windowTrigger?: {
    window: "nudge" | "guide";
    data: any;
  };
}
