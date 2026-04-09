import type { StreamChunk, ToolContext } from "../tools/base.tool.js";

/**
 * Base class for all specialized agents in the multi-agent architecture.
 *
 * Each agent is responsible for a specific domain and has access to a focused
 * set of tools for that domain. Agents communicate through a common interface
 * and can delegate to other agents when needed.
 *
 * Agent Types:
 * - OrchestratorAgent: Routes requests to specialized agents (Gemini Flash)
 * - TextResponseAgent: Simple conversational responses (Gemini Flash)
 * - KnowledgeAgent: Search and synthesize knowledge base (GPT-4)
 * - VisualGuidanceAgent: UI workflows with screenshot analysis (GPT-4 + Vision)
 * - ExpertMatchingAgent: Find expert colleagues (GPT-3.5)
 */
export abstract class BaseAgent {
  /**
   * Unique identifier for this agent
   */
  abstract readonly name: string;

  /**
   * Execute the agent's logic for a given request.
   *
   * This method is the entry point for all agent execution. It should:
   * 1. Analyze the request context
   * 2. Select and execute appropriate tools
   * 3. Stream results back to the caller
   * 4. Optionally delegate to other agents
   *
   * @param context - Full request context including conversation history, screenshot, metadata
   * @yields StreamChunk - Streamed chunks of the response (chunk, complete, error, window_trigger)
   *
   * @example
   * // In orchestrator:
   * const agent = this.routeToAgent(context);
   * for await (const chunk of agent.execute(context)) {
   *   yield chunk; // Forward to client
   * }
   */
  abstract execute(context: ToolContext): AsyncIterable<StreamChunk>;

  /**
   * Invoke another agent (agent-to-agent communication).
   *
   * This method allows one agent to delegate to another. For example,
   * Visual Guidance Agent can call Knowledge Agent to search for documentation.
   *
   * @param context - Request context (may be modified for delegation)
   * @returns Complete result from the delegated agent
   *
   * @example
   * // In VisualGuidanceAgent:
   * const searchResult = await this.invokeAgent(knowledgeAgent, {
   *   ...context,
   *   message: "product roadmap update"
   * });
   */
  protected async invokeAgent(agent: BaseAgent, context: ToolContext): Promise<StreamChunk> {
    // Collect all chunks from the agent
    const chunks: StreamChunk[] = [];

    for await (const chunk of agent.execute(context)) {
      chunks.push(chunk);
    }

    // Return the final complete chunk
    const completeChunk = chunks.find((c) => c.type === "complete");
    if (!completeChunk) {
      throw new Error(`Agent ${agent.name} did not return a complete chunk`);
    }

    return completeChunk;
  }
}
