/**
 * Summary Refinement Service
 *
 * Thin facade that delegates to the Refinement RLM.
 * The RLM has tool-calling capabilities to fetch session data on-demand
 * and explicitly save user preferences via the save_user_preference tool.
 *
 * Primary: Anthropic native tool_use (Claude Sonnet 4.5 with extended thinking)
 * Fallback: DeepSeek R1 single-shot with pre-loaded context
 */

import { refinementRLMService } from "./rlm/refinement-rlm.service";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RefinementRequest {
  sessionId: string;
  userId: string;
  orgId: string;
  messages: ChatMessage[];
  currentSummary: string;
}

export interface RefinementResponse {
  message: string;
  suggestedEdit: string | null;
  toolCallCount: number;
}

// --------------------------------------------------------------------------
// Service (delegates to RLM)
// --------------------------------------------------------------------------

class SummaryRefinementService {
  async refine(request: RefinementRequest): Promise<RefinementResponse> {
    return refinementRLMService.refine(request);
  }
}

export const summaryRefinementService = new SummaryRefinementService();
