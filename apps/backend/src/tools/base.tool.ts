import type { Message } from "../db/schema/conversations.schema";
import type { SolutionObject, EmbeddingMatch, Step, AdjustmentRecord } from "@mitable/shared";
import type { ExpertMatch } from "../services/expertMatching.service";

// ============================================================================
// TOOL DEFINITION TYPES
// ============================================================================

/**
 * Tool parameter definition for OpenAI function calling
 */
export interface ToolParameters {
  type: "object";
  properties: Record<string, any>;
  required?: string[];
  [key: string]: any; // Allow additional properties for OpenAI compatibility
}

/**
 * OpenAI function calling tool definition
 */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolParameters;
  };
}

// ============================================================================
// CONTEXT TYPES
// ============================================================================

/**
 * Context provided to tools during execution
 */
export interface ToolContext {
  conversationId: string;
  userId: string;
  organizationId: string; // Added for multi-agent architecture
  conversationHistory: Message[];
  screenshot?: string; // Base64 encoded screenshot
  screenshotMetadata?: {
    // Screenshot metadata from capture service
    width: number; // Resized width (typically 1920)
    height: number; // Resized height (typically 1080)
    originalWidth: number; // Physical display width
    originalHeight: number; // Physical display height
    scaleFactor: number; // Display scale factor (1 = standard, 2 = Retina)
    captureMode: string;
    timestamp: number;
  };
  userProfile?: {
    name: string;
    email: string;
    organizationId: string;
  };
  metadata?: {
    // Metadata from frontend UI interactions
    workflowAction?: "progress_step" | "custom_question" | "exit_workflow";
    selectedOption?: number; // Which option was selected from WorkflowOptions (1, 2, or 3)
    [key: string]: any; // Allow additional metadata fields
  };
  workflowState?: SolutionObject; // Pre-loaded by orchestrator for workflow context
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Source reference for knowledge-based responses
 */
export interface Source {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Window trigger data for launching UI windows
 */
export interface WindowTrigger {
  window: "nudge" | "guide";
  data: Record<string, any>;
}

// ============================================================================
// MESSAGE TYPES (Discriminated Union)
// ============================================================================

/**
 * Base message interface with common fields
 */
export interface BaseMessage {
  content: string;
  streamable: boolean;
  sources?: Source[];
  triggerWindow?: WindowTrigger;
}

/**
 * Text-only message (no workflow or expert data)
 */
export interface TextMessage extends BaseMessage {
  messageType: "text";
  cardData?: never; // Explicitly no cardData for text messages
}

/**
 * Workflow phase types
 */
export type WorkflowPhase = "initial_proposal" | "step_progression" | "custom_question";

/**
 * Workflow message with step-by-step guidance state
 */
export interface WorkflowMessage extends BaseMessage {
  messageType: "workflow";
  cardData: {
    // Full SolutionObject (from @mitable/shared)
    solution: string;
    supportingData: EmbeddingMatch[];
    solutionExplanation: string;
    supportingDataExplanation: string;
    stepList: Step[];
    currentStepIndex: number;
    searchQuery: string;
    adjustmentHistory: AdjustmentRecord[];
    // Workflow UI state
    workflowActive: true;
    workflowPhase: WorkflowPhase;
  };
}

/**
 * Suggested nudge content generated from conversation
 */
export interface SuggestedNudge {
  context: string;    // 300-word summary of what user needs help with
  question: string;   // 1-2 sentence actionable question
}

/**
 * Experts message with colleague recommendations
 */
export interface ExpertsMessage extends BaseMessage {
  messageType: "experts";
  cardData: {
    experts: ExpertMatch[];
    suggestedNudge?: SuggestedNudge;  // Auto-generated when from conversation
  };
}

/**
 * Result returned by tool execution (discriminated union)
 */
export type ToolResult = TextMessage | WorkflowMessage | ExpertsMessage;

/**
 * Streaming chunk for real-time responses
 */
export interface StreamChunk {
  type: "chunk" | "complete" | "error" | "window_trigger";
  content?: string;
  messageId?: string;
  messageType?: "text" | "workflow" | "experts";
  cardData?: Record<string, any>;
  sources?: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  error?: string;
  windowTrigger?: WindowTrigger; // Window trigger for UI coordination
}

/**
 * Base class for all agent tools
 *
 * Tools are specialized capabilities that the agent can use to respond to user requests.
 * Each tool defines:
 * - name: Unique identifier for the tool
 * - description: What the tool does (helps AI decide when to use it)
 * - parameters: JSON schema for tool arguments
 * - execute: Implementation of the tool's functionality
 *
 * Example tools:
 * - RespondTextTool: Answer general questions with text
 * - SearchKnowledgeTool: Search documentation with RAG
 * - FindExpertTool: Match user with best colleague expert
 * - GuideNextStepTool: Provide visual UI guidance
 */
export abstract class BaseTool {
  /**
   * Unique name for the tool (used in OpenAI function calling)
   */
  abstract name: string;

  /**
   * Description of what the tool does
   * This helps the AI decide when to use this tool
   */
  abstract description: string;

  /**
   * JSON schema defining the parameters this tool accepts
   */
  abstract parameters: ToolParameters;

  /**
   * Returns the OpenAI function calling definition for this tool
   */
  getDefinition(): ToolDefinition {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }

  /**
   * Execute the tool with the provided arguments
   *
   * @param args - Parsed arguments from OpenAI function call
   * @param context - Context including conversation history, user info, etc.
   * @returns Tool result with message type, content, and optional structured data
   */
  abstract execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult>;

  /**
   * Validate tool arguments before execution
   * Override this method to add custom validation logic
   *
   * @param args - Arguments to validate
   * @throws Error if validation fails
   */
  protected validate(args: Record<string, any>): void {
    // Check required parameters
    if (this.parameters.required) {
      for (const requiredParam of this.parameters.required) {
        if (!(requiredParam in args)) {
          throw new Error(`Missing required parameter: ${requiredParam} for tool ${this.name}`);
        }
      }
    }
  }
}
