/**
 * Demo Draft - Re-exports from centralized config
 *
 * This file maintains backward compatibility with existing imports
 * while using the centralized demoConfig.ts as the source of truth.
 */

import { DEMO_CONFIG, findAIResponseFromConfig } from "./demoConfig";

// Keep existing type exports for backward compatibility
export interface Draft {
  id: string;
  topic: string;
  content: string;
  recipient: string;
  status: "pending" | "sent";
  createdAt: Date;
  sentAt?: Date;
}

export interface AIEditSuggestion {
  id: string;
  userQuery: string;
  aiResponse: string;
  suggestedEdit?: string;
}

// Transform config data into the expected Draft format
export const DEMO_DRAFT: Draft = {
  id: DEMO_CONFIG.draft.id,
  topic: DEMO_CONFIG.draft.topic,
  content: DEMO_CONFIG.draft.content,
  recipient: DEMO_CONFIG.draft.recipient,
  status: "pending",
  createdAt: new Date(),
};

// Build AI responses map from config for backward compatibility
export const DEMO_AI_RESPONSES: Record<string, AIEditSuggestion> = {
  "make-shorter": {
    id: "ai-1",
    userQuery: "Make this shorter and more concise",
    aiResponse: DEMO_CONFIG.ai.responses.shorter.aiResponse,
    suggestedEdit: DEMO_CONFIG.ai.responses.shorter.suggestedEdit,
  },
  "more-professional": {
    id: "ai-2",
    userQuery: "Make it sound more professional",
    aiResponse: DEMO_CONFIG.ai.responses.professional.aiResponse,
    suggestedEdit: DEMO_CONFIG.ai.responses.professional.suggestedEdit,
  },
  "add-metrics": {
    id: "ai-3",
    userQuery: "Add some metrics or numbers",
    aiResponse: DEMO_CONFIG.ai.responses.metrics.aiResponse,
    suggestedEdit: DEMO_CONFIG.ai.responses.metrics.suggestedEdit,
  },
};

// Helper to find AI response based on user query
export function findAIResponse(query: string): AIEditSuggestion | null {
  const result = findAIResponseFromConfig(query);

  if (result) {
    // Return in the expected AIEditSuggestion format
    return {
      id: `ai-${Date.now()}`,
      userQuery: query,
      aiResponse: result.aiResponse,
      suggestedEdit: result.suggestedEdit,
    };
  }

  return null;
}

// Re-export config for direct access
export { DEMO_CONFIG };
