import { BaseTool, ToolContext, ToolParameters, ToolResult } from "./base.tool";
import { expertMatchingService } from "../services/expertMatching.service";

/**
 * Find Expert Tool
 *
 * Matches users with expert colleagues who can help with their questions.
 * Uses a sophisticated matching algorithm combining:
 * - Expertise similarity (40%) via semantic embeddings
 * - Performance metrics (30%) - response rate, helpfulness score
 * - Availability (30%) - current online status
 *
 * Use cases:
 * - When knowledge search doesn't find sufficient information
 * - When user explicitly asks to connect with someone
 * - When a question requires human judgment or discussion
 * - Follow-up to failed knowledge search
 *
 * Auto-launches the Nudge window to display expert recommendations.
 */
export class FindExpertTool extends BaseTool {
  name = "find_expert_colleague";

  description = `
    Find and recommend expert colleagues who can help answer the user's question.
    Use this tool when:
    - The knowledge search didn't find relevant information
    - The user's question requires human expertise or discussion
    - The user explicitly asks to talk to someone
    - A topic requires specialized knowledge not in the documentation

    This tool will match the user with the best available experts and automatically
    show them in the Nudge window for the user to contact.
  `.trim();

  parameters: ToolParameters = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The topic or question to find an expert for. Should be clear and specific.",
      },
      topK: {
        type: "number",
        description: "Number of expert recommendations to provide (default: 5, max: 5)",
        default: 5,
      },
    },
    required: ["query"],
  };

  /**
   * Execute expert matching
   *
   * @param args - Query and options
   * @param context - User and organization context
   * @returns Tool result with expert matches and window trigger
   */
  async execute(args: { query: string; topK?: number }, context: ToolContext): Promise<ToolResult> {
    // Validate arguments
    this.validate(args);

    const { query, topK = 3 } = args;
    const organizationId = context.userProfile?.organizationId;

    console.log("[FindExpertTool] Organization context:", {
      organizationId: organizationId || "none",
      hasUserProfile: !!context.userProfile,
      topK,
    });

    if (!organizationId) {
      return {
        messageType: "text",
        content: "I couldn't determine your organization. Please try again or contact support.",
        streamable: true,
      };
    }

    console.log(`[FindExpertTool] Finding experts for: "${query}"`);

    try {
      // Find matching experts
      const experts = await expertMatchingService.findExperts(
        query,
        organizationId,
        Math.min(topK, 5) // Cap at 5 experts
      );

      console.log("[FindExpertTool] Experts found:", {
        count: experts.length,
        topExpert: experts[0]?.name,
        topScore: experts[0]?.matchScore,
      });

      if (experts.length === 0) {
        console.log("[FindExpertTool] No experts found in organization");
        return {
          messageType: "text",
          content:
            "I couldn't find any experts in your organization for this topic at the moment. You might want to post in a team channel or reach out to your manager.",
          streamable: true,
        };
      }

      console.log(`[FindExpertTool] Found ${experts.length} expert matches`);

      // Format response message
      const expertNames = experts.map((e) => e.name).join(", ");
      const topExpert = experts[0];

      const responseText = `I found ${experts.length} expert${experts.length > 1 ? "s" : ""} who can help with this: ${expertNames}.

${topExpert.name} seems like the best match - they have ${topExpert.expertise.topics.slice(0, 2).join(" and ")} expertise with a ${topExpert.performance.helpfulnessScore.toFixed(1)}/5.0 helpfulness rating.

I'm showing you their profiles now so you can reach out!`;

      console.log("[FindExpertTool] Success - triggering Nudge window:", {
        expertsCount: experts.length,
        expertNames: experts.map((e) => e.name),
        windowTrigger: "nudge",
      });

      // Return with window trigger to launch Nudge window
      return {
        messageType: "experts",
        content: responseText,
        cardData: {
          experts: experts,
        },
        streamable: true,
        triggerWindow: {
          window: "nudge",
          data: {
            experts: experts,
            query: query,
          },
        },
      };
    } catch (error) {
      console.error("[FindExpertTool] Error finding experts:", error);

      return {
        messageType: "text",
        content:
          "I encountered an error while searching for experts. Please try again or reach out through your team channels.",
        streamable: true,
      };
    }
  }
}
