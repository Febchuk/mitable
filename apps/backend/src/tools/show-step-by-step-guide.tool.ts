import { BaseTool, ToolContext, ToolParameters, ToolResult } from "./base.tool.js";
import { geminiVisionService } from "../services/gemini-vision.service.js";
import { guideGenerationService } from "../services/guideGeneration.service.js";
import type { SolutionObject, EmbeddingMatch } from "@mitable/shared";

export class ShowStepByStepGuideTool extends BaseTool {
  name = "show_step_by_step_guide";

  description = `Generate step-by-step UI guidance for completing a task when the user writes a message like "How do I do this?" or "Show me how to do this?" AND there is a screenshot available.
IMPORTANT: Use this ONLY AFTER calling search_knowledge. You must pass the full search results as supportingData.
Extract the sources array from search_knowledge response and include ALL fields (title, url, snippet).`;

  parameters: ToolParameters = {
    type: "object",
    properties: {
      solution: {
        type: "string",
        description: "High-level goal (e.g., 'Modify task descriptions in the roadmap')",
      },
      solutionExplanation: {
        type: "string",
        description: "Why this approach based on company documentation",
      },
      supportingDataExplanation: {
        type: "string",
        description: "Why these specific docs support the solution",
      },
      searchQuery: {
        type: "string",
        description: "The query used in search_knowledge",
      },
      supportingData: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "Full text from the source document" },
            source: { type: "string", description: "Source title" },
            metadata: {
              type: "object",
              properties: {
                score: { type: "number" },
              },
              additionalProperties: true,
            },
          },
          required: ["text", "source", "metadata"],
        },
        description: "FULL search results from search_knowledge (not snippets). Extract from sources array.",
      },
      stepList: {
        type: "array",
        items: {
          type: "object",
          properties: {
            stepNumber: { type: "number" },
            description: { type: "string" },
            status: { type: "string", enum: ["pending", "current", "completed"] },
          },
          required: ["stepNumber", "description", "status"],
        },
        description: "Initial estimated steps (3-5 steps typically)",
      },
    },
    required: ["solution", "solutionExplanation", "supportingDataExplanation", "searchQuery", "supportingData", "stepList"],
  };

  async execute(
    args: Partial<SolutionObject>,
    context: ToolContext
  ): Promise<ToolResult> {
    this.validate(args);

    console.log("[ShowStepByStepGuideTool] Execute:", args.solution);

    if (!context.screenshot) {
      return {
        messageType: "text",
        content: "I need to see your screen to provide step-by-step guidance.",
        streamable: true,
      };
    }

    if (!args.supportingData || args.supportingData.length === 0) {
      return {
        messageType: "text",
        content: "Supporting data from search_knowledge is required. Please search first.",
        streamable: true,
      };
    }

    const solutionObject: SolutionObject = {
      solution: args.solution!,
      supportingData: args.supportingData as EmbeddingMatch[],
      solutionExplanation: args.solutionExplanation!,
      supportingDataExplanation: args.supportingDataExplanation!,
      stepList: args.stepList!.map((s, idx) => ({
        ...s,
        status: idx === 0 ? "current" : "pending",
      })),
      currentStepIndex: 0,
      searchQuery: args.searchQuery!,
      adjustmentHistory: [],
    };

    const firstStep = solutionObject.stepList[0];
    const visualGuidance = await geminiVisionService.analyzeStepExecution(
      context.screenshot,
      solutionObject,
      firstStep,
      context.conversationHistory
    );

    await guideGenerationService.storeSolutionObject(
      context.conversationId,
      `Step 1 of ${solutionObject.stepList.length}: ${firstStep.description}`,
      solutionObject
    );

    const guidanceText = `Step 1 of ${solutionObject.stepList.length}: ${firstStep.description}

→ ${visualGuidance.elementDescription}
→ ${visualGuidance.visualContext}

${visualGuidance.confidence === "low" && visualGuidance.alternativeElements?.[0] ? `Note: ${visualGuidance.alternativeElements[0]}` : ""}

What questions do you have?`;

    console.log("[ShowStepByStepGuideTool] Guide created with", solutionObject.stepList.length, "steps");

    return {
      messageType: "workflow",
      content: guidanceText,
      cardData: solutionObject,
      streamable: true,
      triggerWindow: {
        window: "guide",
        data: {
          stepList: solutionObject.stepList,
          currentStepIndex: 0,
        },
      },
    };
  }
}
