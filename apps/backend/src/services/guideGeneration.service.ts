import type { Guide, SolutionObject } from "@mitable/shared";
import { db } from "../db/client.js";
import { messages } from "../db/schema/index.js";
import { eq, and, desc } from "drizzle-orm";

/**
 * Guide lookup result
 */
interface GuideLookupResult {
  found: boolean;
  guide?: Guide;
  message: string;
}

/**
 * Guide Generation Service
 *
 * Responsible for:
 * 1. Looking up existing guides from a knowledge base
 * 2. Generating dynamic guides based on user questions (future: with Gemini Vision)
 * 3. Extracting UI element coordinates from screenshots
 *
 * Current implementation uses pre-defined guides.
 * Future enhancement: Dynamic guide generation using Gemini Vision API.
 */
class GuideGenerationService {
  /**
   * Pre-defined guides for common workflows
   * In production, these would be stored in a database
   */
  private predefinedGuides: Map<string, Guide> = new Map();

  constructor() {
    this.initializePredefinedGuides();
  }

  /**
   * Find a guide based on user's question/intent
   *
   * @param query - User's question (e.g., "How do I submit an expense report?")
   * @param screenshot - Base64 encoded screenshot (optional, for dynamic generation)
   * @returns Guide lookup result
   */
  async findGuide(query: string, screenshot?: string): Promise<GuideLookupResult> {
    console.log(`[GuideGenerationService] Looking for guide: "${query}"`);
    console.log("[GuideGenerationService] Request details:", {
      query,
      hasScreenshot: !!screenshot,
      normalizedQuery: query.toLowerCase(),
    });

    // Normalize query for keyword matching
    const normalizedQuery = query.toLowerCase();

    // Match common patterns
    if (this.matchesPattern(normalizedQuery, ["expense", "report", "submit"])) {
      console.log("[GuideGenerationService] Pattern matched: expense report");

      return {
        found: true,
        guide: this.predefinedGuides.get("submit-expense-report"),
        message: "Found a step-by-step guide for submitting expense reports",
      };
    }

    if (this.matchesPattern(normalizedQuery, ["pto", "time off", "vacation", "request"])) {
      console.log("[GuideGenerationService] Pattern matched: PTO request");

      return {
        found: true,
        guide: this.predefinedGuides.get("request-pto"),
        message: "Found a guide for requesting time off",
      };
    }

    if (this.matchesPattern(normalizedQuery, ["slack", "channel", "create"])) {
      console.log("[GuideGenerationService] Pattern matched: Slack channel creation");

      return {
        found: true,
        guide: this.predefinedGuides.get("create-slack-channel"),
        message: "Found a guide for creating Slack channels",
      };
    }

    if (this.matchesPattern(normalizedQuery, ["billing", "issue", "escalate"])) {
      console.log("[GuideGenerationService] Pattern matched: billing escalation");

      return {
        found: true,
        guide: this.predefinedGuides.get("billing-escalation"),
        message: "Found a guide for escalating billing issues",
      };
    }

    // No guide found
    console.log("[GuideGenerationService] No matching guide found");
    console.log("[GuideGenerationService] Patterns checked:", {
      patterns: ["expense report", "PTO request", "Slack channel", "billing escalation"],
    });
    return {
      found: false,
      message:
        "I couldn't find a specific guide for that task. Would you like me to search the knowledge base or connect you with an expert?",
    };
  }

  /**
   * Check if query matches a pattern of keywords
   */
  private matchesPattern(query: string, keywords: string[]): boolean {
    return keywords.every((keyword) => query.includes(keyword));
  }

  /**
   * Initialize pre-defined guides
   * In production, these would be loaded from database
   */
  private initializePredefinedGuides(): void {
    // Expense Report Guide
    this.predefinedGuides.set("submit-expense-report", {
      id: "guide-expense-report",
      title: "Submit an Expense Report",
      description: "Step-by-step guide to submit your expenses for reimbursement",
      steps: [
        {
          id: "step-1",
          stepNumber: 1,
          instruction: "Open the Finance Portal from your apps menu",
          targetElement: {
            label: "Finance Portal",
            boundingBox: { x: 100, y: 100, width: 200, height: 50 },
          },
          arrowPosition: { x: 200, y: 80, rotation: 180 },
          completed: false,
        },
        {
          id: "step-2",
          stepNumber: 2,
          instruction: 'Click on "New Expense Report" button',
          targetElement: {
            label: "New Expense Report Button",
            boundingBox: { x: 300, y: 150, width: 180, height: 40 },
          },
          arrowPosition: { x: 390, y: 130, rotation: 180 },
          completed: false,
        },
        {
          id: "step-3",
          stepNumber: 3,
          instruction: "Fill in the expense details (date, amount, category)",
          targetElement: {
            label: "Expense Form",
            boundingBox: { x: 400, y: 200, width: 500, height: 300 },
          },
          completed: false,
        },
        {
          id: "step-4",
          stepNumber: 4,
          instruction: "Upload receipts by dragging files or clicking the upload button",
          targetElement: {
            label: "Upload Area",
            boundingBox: { x: 450, y: 520, width: 400, height: 100 },
          },
          completed: false,
        },
        {
          id: "step-5",
          stepNumber: 5,
          instruction: 'Click "Submit for Approval" to send to your manager',
          targetElement: {
            label: "Submit Button",
            boundingBox: { x: 750, y: 650, width: 150, height: 40 },
          },
          arrowPosition: { x: 825, y: 630, rotation: 180 },
          completed: false,
        },
      ],
      currentStep: 0,
      completed: false,
      createdAt: new Date().toISOString(),
    });

    // PTO Request Guide
    this.predefinedGuides.set("request-pto", {
      id: "guide-request-pto",
      title: "Request Time Off",
      description: "Submit a PTO (Paid Time Off) request",
      steps: [
        {
          id: "step-1",
          stepNumber: 1,
          instruction: "Open the HR Portal",
          targetElement: {
            label: "HR Portal",
            boundingBox: { x: 120, y: 120, width: 180, height: 50 },
          },
          completed: false,
        },
        {
          id: "step-2",
          stepNumber: 2,
          instruction: 'Navigate to "Time Off" section',
          targetElement: {
            label: "Time Off Tab",
            boundingBox: { x: 50, y: 200, width: 150, height: 40 },
          },
          completed: false,
        },
        {
          id: "step-3",
          stepNumber: 3,
          instruction: 'Click "Request Time Off"',
          targetElement: {
            label: "Request Button",
            boundingBox: { x: 300, y: 250, width: 200, height: 45 },
          },
          completed: false,
        },
        {
          id: "step-4",
          stepNumber: 4,
          instruction: "Select dates and PTO type (vacation, sick, personal)",
          targetElement: {
            label: "Date Picker",
            boundingBox: { x: 400, y: 300, width: 450, height: 200 },
          },
          completed: false,
        },
        {
          id: "step-5",
          stepNumber: 5,
          instruction: "Submit your request for manager approval",
          targetElement: {
            label: "Submit Request",
            boundingBox: { x: 700, y: 550, width: 150, height: 40 },
          },
          completed: false,
        },
      ],
      currentStep: 0,
      completed: false,
      createdAt: new Date().toISOString(),
    });

    // Billing Escalation Guide (from demo data)
    this.predefinedGuides.set("billing-escalation", {
      id: "guide-billing-escalation",
      title: "Escalate Billing Issue",
      description: "How to properly escalate a customer billing issue",
      steps: [
        {
          id: "step-1",
          stepNumber: 1,
          instruction: "Open the customer's account in the billing dashboard",
          targetElement: {
            label: "Customer Account",
            boundingBox: { x: 150, y: 100, width: 300, height: 60 },
          },
          completed: false,
        },
        {
          id: "step-2",
          stepNumber: 2,
          instruction: 'Click the "Escalate Issue" button in the top right',
          targetElement: {
            label: "Escalate Button",
            boundingBox: { x: 850, y: 80, width: 150, height: 40 },
          },
          arrowPosition: { x: 925, y: 60, rotation: 180 },
          completed: false,
        },
        {
          id: "step-3",
          stepNumber: 3,
          instruction: "Select the issue category from the dropdown",
          targetElement: {
            label: "Issue Category",
            boundingBox: { x: 400, y: 200, width: 250, height: 45 },
          },
          completed: false,
        },
        {
          id: "step-4",
          stepNumber: 4,
          instruction: "Fill in the escalation details and customer impact",
          targetElement: {
            label: "Details Form",
            boundingBox: { x: 350, y: 270, width: 500, height: 200 },
          },
          completed: false,
        },
        {
          id: "step-5",
          stepNumber: 5,
          instruction: "Assign to the billing team lead",
          targetElement: {
            label: "Assign To",
            boundingBox: { x: 400, y: 490, width: 250, height: 45 },
          },
          completed: false,
        },
        {
          id: "step-6",
          stepNumber: 6,
          instruction: 'Click "Submit Escalation" to notify the team',
          targetElement: {
            label: "Submit",
            boundingBox: { x: 700, y: 570, width: 150, height: 40 },
          },
          arrowPosition: { x: 775, y: 550, rotation: 180 },
          completed: false,
        },
      ],
      currentStep: 0,
      completed: false,
      createdAt: new Date().toISOString(),
    });

    console.log(
      `[GuideGenerationService] Initialized ${this.predefinedGuides.size} pre-defined guides`
    );
  }

  async storeSolutionObject(
    conversationId: string,
    content: string,
    solutionObject: SolutionObject
  ): Promise<void> {
    await db.insert(messages).values({
      conversationId,
      role: "assistant",
      content,
      messageType: "workflow",
      cardData: solutionObject as any,
    });

    console.log("[GuideGenerationService] Stored solution:", {
      conversationId,
      steps: solutionObject.stepList.length,
    });
  }

  async retrieveSolutionObject(conversationId: string): Promise<SolutionObject | null> {
    const result = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.messageType, "workflow")))
      .orderBy(desc(messages.createdAt))
      .limit(1);

    if (!result[0]?.cardData) {
      return null;
    }

    return result[0].cardData as SolutionObject;
  }

  /**
   * Retrieve the latest SolutionObject from a conversation
   * ONLY returns workflow state if there's an ACTIVE workflow session
   * Used by orchestrator to determine if workflow mode is active
   * 
   * IMPORTANT: This checks workflow_sessions table, not messages table,
   * to ensure completed/cancelled workflows don't interfere with normal chat
   */
  async retrieveLatestSolutionObject(conversationId: string): Promise<SolutionObject | null> {
    // Import workflowService to check actual session status
    const { workflowService } = await import("./workflow.service.js");
    
    // Get the active workflow session (checks workflow_sessions table)
    const activeWorkflow = await workflowService.getActiveWorkflow(conversationId);
    
    // Only return workflow data if session is actually active
    if (!activeWorkflow || activeWorkflow.status !== "active") {
      return null;
    }
    
    // Transform workflowData to match SolutionObject structure
    // The workflow service uses 'stepDescription' but shared type uses 'description'
    const workflowData = activeWorkflow.workflowData as any;
    return {
      solution: workflowData.solution,
      solutionExplanation: workflowData.solutionExplanation,
      searchQuery: workflowData.searchQuery,
      supportingData: workflowData.supportingData || [],
      supportingDataExplanation: workflowData.supportingDataExplanation,
      stepList: (workflowData.stepList || []).map((step: any) => ({
        stepNumber: step.stepNumber,
        description: step.description || step.stepDescription,
        status: step.status,
      })),
      currentStepIndex: workflowData.currentStepIndex,
      adjustmentHistory: workflowData.adjustmentHistory || [],
    };
  }

  async updateSolutionObject(
    conversationId: string,
    updatedSolution: SolutionObject,
    content: string
  ): Promise<void> {
    await db.insert(messages).values({
      conversationId,
      role: "assistant",
      content,
      messageType: "workflow",
      cardData: updatedSolution as any,
    });

    console.log("[GuideGenerationService] Updated solution:", {
      conversationId,
      currentStep: updatedSolution.currentStepIndex + 1,
      adjustments: updatedSolution.adjustmentHistory.length,
    });
  }
}

// Export singleton instance
export const guideGenerationService = new GuideGenerationService();
