import type { Message } from "../db/schema/conversations.schema";

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

/**
 * Context provided to tools during execution
 */
export interface ToolContext {
  conversationId: string;
  userId: string;
  conversationHistory: Message[];
  screenshot?: string; // Base64 encoded screenshot (future)
  userProfile?: {
    name: string;
    email: string;
    organizationId: string;
  };
}

/**
 * Window trigger data for launching UI windows
 */
export interface WindowTrigger {
  window: "nudge" | "guide";
  data: Record<string, any>;
}

/**
 * Result returned by tool execution
 */
export interface ToolResult {
  messageType: "text" | "workflow" | "experts";
  content: string;
  cardData?: Record<string, any>;
  sources?: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  streamable: boolean; // Whether this result can be streamed
  triggerWindow?: WindowTrigger; // Optional window trigger for UI coordination
}

/**
 * Streaming chunk for real-time responses
 */
export interface StreamChunk {
  type: "chunk" | "complete" | "error" | "window_trigger";
  content?: string;
  messageId?: string;
  messageType?: "text" | "workflow" | "experts";
  cardData?: Record<string, any>;
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
