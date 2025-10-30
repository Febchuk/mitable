import { BaseTool, ToolContext, ToolParameters, ToolResult } from "./base.tool.js";
import { geminiVisionService } from "../services/gemini-vision.service.js";

export class ClarifyIntentTool extends BaseTool {
  name = "clarify_intent";

  description = `
    Use when user's question is vague and a screenshot is available.
    Examples: "How do I do this?", "Help me with this", "What should I click?"
    Analyzes their screen to offer specific task interpretations.
  `.trim();

  parameters: ToolParameters = {
    type: "object",
    properties: {
      vaguePrompt: {
        type: "string",
        description: "The vague question the user asked",
      },
    },
    required: ["vaguePrompt"],
  };

  async execute(args: { vaguePrompt: string }, context: ToolContext): Promise<ToolResult> {
    this.validate(args);

    console.log("[ClarifyIntentTool] Execute:", args.vaguePrompt);

    if (!context.screenshot) {
      return {
        messageType: "text",
        content: "I need to see your screen to understand what you're asking about.",
        streamable: true,
      };
    }

    const result = await geminiVisionService.interpretVaguePrompt(
      context.screenshot,
      args.vaguePrompt
    );

    const options = result.interpretations
      .map((interp, idx) => `${idx + 1}. ${interp.task}`)
      .join("\n");

    const content = `Based on your screen, you might be asking about:\n\n${options}\n\nWhich one can I help you with?`;

    console.log("[ClarifyIntentTool] Returning", result.interpretations.length, "interpretations");

    return {
      messageType: "text",
      content,
      streamable: true,
    };
  }
}
