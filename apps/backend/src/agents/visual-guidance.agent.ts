import OpenAI from "openai";
import { config } from "../config";
import { BaseAgent } from "./base.agent";
import { KnowledgeAgent } from "./knowledge.agent";
import type { StreamChunk, ToolContext } from "../tools/base.tool";
import { ClarifyIntentTool } from "../tools/clarify-intent.tool";
import { GuideNextStepTool } from "../tools/guide-next-step.tool";
import { AnalyzeWorkflowScreenTool } from "../tools/analyze-workflow-screen.tool";
import { workflowService } from "../services/workflow.service";

/**
 * Visual Guidance Agent
 *
 * Multi-step UI guidance with screenshot analysis.
 * Uses GPT-4 Turbo for workflow synthesis + Gemini Vision 2.0 Flash for visual understanding.
 *
 * Responsibilities:
 * - "How do I..." questions with screenshots
 * - Step-by-step UI guidance
 * - Workflow progression
 * - Screen troubleshooting
 * - Vague prompt clarification
 *
 * Tools:
 * - clarify_intent: Analyze vague prompts, offer specific interpretations
 * - start_ui_guidance_workflow: Create initial step-by-step plan
 * - guide_next_step: Progress to next step, analyze screen, generate visual guidance
 * - analyze_workflow_screen: Troubleshoot visual issues during workflow
 *
 * Services Used:
 * - OpenAI GPT-4 Turbo: Synthesize search results into structured workflows
 *   - Generates solution, explanation, and adaptive step-by-step guidance
 *   - Determines complexity and adjusts step count (3-5 for simple, 8-12+ for complex)
 * - KnowledgeAgent: Search company documentation (Slack + Notion)
 * - geminiVisionService: Screenshot analysis (called by tools, not directly)
 *   - analyzeScreenshot(): UI element detection
 *   - evaluateProgress(): Plan adjustment detection
 *   - analyzeStepExecution(): Step-specific guidance
 *   - interpretVaguePrompt(): Intent clarification
 * - guideGenerationService: Workflow state management
 *
 * Workflow Creation Flow:
 * 1. Call KnowledgeAgent.search() for company documentation
 * 2. Use GPT-4 to synthesize search results into SolutionObject with JSON mode
 * 3. Validate all required fields (solution, explanation, stepList, etc.)
 * 4. Execute StartUIGuidanceWorkflowTool with validated parameters
 *
 * Complexity Detection:
 * - LOW (3-5 steps): Single app, linear workflow
 * - MEDIUM (5-8 steps): Multi-app, nested menus
 * - HIGH (8-12+ steps): Debugging, multi-system tracing
 *
 * Agent-to-Agent Communication:
 * - Calls KnowledgeAgent for knowledge-grounded workflows
 *
 * Triggers:
 * - Guide Window (via triggerWindow mechanism)
 */
export class VisualGuidanceAgent extends BaseAgent {
  readonly name = "visual-guidance";
  private openai: OpenAI;
  private knowledgeAgent: KnowledgeAgent;
  private clarifyIntentTool: ClarifyIntentTool;
  private guideNextStepTool: GuideNextStepTool;
  private analyzeScreenTool: AnalyzeWorkflowScreenTool;

  constructor(knowledgeAgent: KnowledgeAgent) {
    super();
    this.openai = new OpenAI({ apiKey: config.openai.apiKey });
    this.knowledgeAgent = knowledgeAgent;
    this.clarifyIntentTool = new ClarifyIntentTool();
    this.guideNextStepTool = new GuideNextStepTool();
    this.analyzeScreenTool = new AnalyzeWorkflowScreenTool();
  }

  /**
   * Execute visual guidance workflow
   */
  async *execute(context: ToolContext): AsyncIterable<StreamChunk> {
    try {
      // Check if screenshot is available
      if (!context.screenshot) {
        yield {
          type: "complete",
          messageType: "text",
          content:
            "I need to see your screen to provide step-by-step guidance. Please capture a screenshot.",
        };
        return;
      }

      // Get the last user message
      const lastUserMessage = context.conversationHistory
        .filter((msg) => msg.role === "user")
        .pop();

      if (!lastUserMessage) {
        yield {
          type: "error",
          error: "No user message found in conversation history",
        };
        return;
      }

      // Handle metadata-driven routing (deterministic)
      if (context.metadata?.workflowAction === "confirm_start") {
        // User confirmed workflow start - create workflow session in database
        console.log(
          "[VisualGuidanceAgent] User confirmed workflow start - creating workflow session"
        );

        // Find the last assistant message with _awaitingConfirmation
        const proposalMessage = context.conversationHistory
          .filter((msg) => msg.role === "assistant" && (msg.cardData as any)?._awaitingConfirmation)
          .pop();

        const cardData = proposalMessage?.cardData as any;
        if (!cardData?._pendingWorkflow) {
          yield {
            type: "error",
            error: "Could not find pending workflow data. Please try asking again.",
          };
          return;
        }

        // Build the full SolutionObject with the workflow starting (step 0)
        const solutionObject = {
          ...cardData._pendingWorkflow,
          currentStepIndex: 0, // Start at first step
          adjustmentHistory: [],
          stepList: cardData._pendingWorkflow.stepList.map((step: any, index: number) => ({
            ...step,
            status: index === 0 ? "current" : "pending",
          })),
        };

        // Create workflow session in database (NOT in messages table)
        console.log("[VisualGuidanceAgent] Creating workflow session with:", {
          organizationId: context.organizationId,
          conversationId: context.conversationId,
          userId: context.userId,
          solution: solutionObject.solution,
        });

        const workflowSession = await workflowService.createWorkflowSession(
          context.organizationId,
          context.conversationId,
          context.userId,
          solutionObject
        );

        console.log("[VisualGuidanceAgent] ✅ Workflow session created successfully:", {
          sessionId: workflowSession.id,
          status: workflowSession.status,
          currentStepIndex: workflowSession.currentStepIndex,
        });

        const confirmMessage = "Perfect! Let's get started with step 1.";

        // ✅ Phase 2A: No longer write workflow to messages table
        // Workflow data is in workflow_sessions table, accordion polls for it
        yield {
          type: "complete",
          messageType: "text",
          content: confirmMessage,
        };
        return;
      }

      if (context.metadata?.workflowAction === "progress_step") {
        // User clicked "Move on to next step" - progress workflow
        console.log("[VisualGuidanceAgent] User progressing to next step");

        // Get active workflow session
        const activeWorkflow = await workflowService.getActiveWorkflow(context.conversationId);
        if (!activeWorkflow) {
          yield {
            type: "error",
            error: "No active workflow found. Please start a new workflow.",
          };
          return;
        }

        // Progress to next step
        const newStepIndex = activeWorkflow.currentStepIndex + 1;
        await workflowService.progressStep(activeWorkflow.id, newStepIndex);

        // Execute the guide next step tool for AI response
        const result = await this.guideNextStepTool.execute(
          {
            conversationId: context.conversationId,
          },
          context
        );

        // Log AI response as interaction
        await workflowService.addInteraction(
          activeWorkflow.id,
          "ai_response",
          "assistant",
          result.content,
          newStepIndex
        );

        // DON'T yield a message - accordion updates via polling
        // Yielding creates duplicate accordion instances
        console.log(
          "[VisualGuidanceAgent] Step progressed, interaction saved. No message needed - accordion will poll."
        );

        // Return empty to end the stream without creating a message
        yield {
          type: "complete",
          content: "", // Empty content - no message will be saved
          messageType: "text", // Not "workflow" - prevents accordion duplication
        };
        return;
      }

      // Check if user message is vague ("How do I do this?", "Help me with this")
      const isVaguePrompt = this.isVaguePrompt(lastUserMessage.content);

      if (isVaguePrompt) {
        // Use clarify_intent to analyze screen and offer interpretations
        const result = await this.clarifyIntentTool.execute(
          {
            vaguePrompt: lastUserMessage.content,
          },
          context
        );

        yield {
          type: "complete",
          messageType: result.messageType,
          content: result.content,
          cardData: result.cardData,
        };
        return;
      }

      // Handle custom questions during active workflow
      // NOTE: This only LOGS the Q&A, does NOT modify steps
      // Steps should only be modified when AI explicitly detects the workflow needs updating
      if (context.workflowState) {
        console.log("[VisualGuidanceAgent] User asked question during workflow");

        // Get active workflow session
        const activeWorkflow = await workflowService.getActiveWorkflow(context.conversationId);

        if (activeWorkflow) {
          // Log user question
          await workflowService.addInteraction(
            activeWorkflow.id,
            "user_question",
            "user",
            lastUserMessage.content,
            activeWorkflow.currentStepIndex
          );
        }

        const questionType = this.classifyWorkflowQuestion(lastUserMessage.content);

        if (questionType === "visual") {
          // Visual/UI issue - use analyze_workflow_screen
          const result = await this.analyzeScreenTool.execute(
            {
              conversationId: context.conversationId,
              issue: lastUserMessage.content,
            },
            context
          );

          // Log AI response
          if (activeWorkflow) {
            await workflowService.addInteraction(
              activeWorkflow.id,
              "ai_response",
              "assistant",
              result.content,
              activeWorkflow.currentStepIndex
            );
          }

          yield {
            type: "complete",
            messageType: result.messageType,
            content: result.content,
            cardData: result.cardData,
          };
          return;
        } else {
          // Conceptual question - call KnowledgeAgent
          const searchResult = await this.knowledgeAgent.search(lastUserMessage.content, context);

          // Log AI response to workflow_interactions (not messages table)
          if (activeWorkflow) {
            await workflowService.addInteraction(
              activeWorkflow.id,
              "ai_response",
              "assistant",
              searchResult.content,
              activeWorkflow.currentStepIndex
            );
          }

          // DON'T yield a message - accordion updates via polling
          console.log(
            "[VisualGuidanceAgent] Custom question answered, interaction saved. No message needed - accordion will poll."
          );

          yield {
            type: "complete",
            content: "", // Empty - no message will be saved
            messageType: "text", // Not "workflow"
          };
          return;
        }
      }

      // Start new workflow: STEP 1 - Search knowledge, STEP 2 - Synthesize workflow with GPT-4
      console.log("[VisualGuidanceAgent] Starting knowledge-grounded workflow");

      // STEP 1: Call KnowledgeAgent for company documentation
      const searchResult = await this.knowledgeAgent.search(lastUserMessage.content, context);

      console.log("[VisualGuidanceAgent] Search complete:", {
        query: lastUserMessage.content.substring(0, 100),
        sourcesFound: searchResult.sources?.length || 0,
      });

      // STEP 2: Use GPT-4 to synthesize search results into structured workflow
      // Note: We only ask GPT-4 to generate fields requiring synthesis
      // (solution, explanations, steps). We'll pass supportingData and searchQuery directly.
      const synthesisPrompt = `You are creating step-by-step UI guidance for an employee based on company documentation.

Generate a JSON object with the following structure:

{
  "solution": "string - High-level goal in natural language",
  "solutionExplanation": "string - WHY this approach makes sense",
  "supportingDataExplanation": "string - HOW results support solution",
  "stepList": [
    {
      "stepNumber": number,
      "description": "string - Actionable instruction",
      "status": "pending"
    }
  ]
}

USER'S REQUEST:
"${lastUserMessage.content}"

SEARCH RESULTS FROM COMPANY KNOWLEDGE BASE:
${JSON.stringify(searchResult.sources || [], null, 2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DETAILED INSTRUCTIONS FOR EACH FIELD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **solution** (string)
   High-level goal that directly addresses the user's question in natural, user-friendly language.
   This should reflect your REASONING about what the user needs to accomplish.

   Examples:
   ✅ GOOD: "Debug why user profiles aren't loading by tracing the data flow from frontend to backend logs"
   ✅ GOOD: "Update the product roadmap canvas in the #product-team Slack channel"
   ❌ BAD: "Fix bug" (too vague)
   ❌ BAD: "Modify task descriptions in database" (too technical, not user-centric)

2. **solutionExplanation** (string)
   Explain WHY this approach makes sense based on search results and your reasoning chain.
   This demonstrates your synthesis process.

   For simple problems: Reference key search results that guided the approach.
   For complex problems: Show your reasoning chain that connected fragmented information.

   Examples:
   ✅ GOOD: "Based on messages in #product-team, the roadmap is maintained as a Slack canvas where the team collaborates openly. This follows the company's transparency culture from the Notion wiki."
   ✅ GOOD: "The search results show this is an Electron app with IPC-based communication. To debug profile loading, we need to trace: UserProfile.tsx → IPC channel → backend API → CloudWatch logs. AWS credentials are in 1Password per the team wiki."
   ❌ BAD: "The documentation says to do it this way."
   ❌ BAD: "This is how you fix bugs."

3. **supportingDataExplanation** (string)
   Explain HOW the specific search results in supportingData support your solution.
   This proves you actually used the search results to synthesize your steps, not just hallucinated them.
   Connect the dots: Show which search results informed which parts of your stepList.

   Examples:
   ✅ GOOD: "The Slack message from #product-team reveals the canvas location (step 1-2), while the Notion transparency doc explains why we notify the team after changes (step 4)."
   ✅ GOOD: "The GitHub README identifies the Electron architecture (informs steps 1-3), the #engineering Slack shows the API endpoint (step 4), Confluence provides the CloudWatch location (steps 6-8), and the email mentions 1Password credentials (step 5)."
   ❌ BAD: "These docs are relevant to the task."
   ❌ BAD: "The search results contain information about the solution."

   This field is your proof of intelligent synthesis - show your work.

4. **stepList** (array of step objects)
   Ordered list of actionable steps synthesized through intelligent reasoning.
   This is the CORE of your synthesis.

   Each step MUST have:
   - stepNumber (number): Sequential starting from 0 (Step 0 is ALWAYS pre-flight)
   - description (string): Clear, actionable instruction
   - status (string): Always "pending" initially

   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ⚠️ CRITICAL: STEP 0 IS MANDATORY (PRE-FLIGHT CHECK)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   
   **ALWAYS start with Step 0** as a pre-flight check to verify the target application.
   
   Step 0 Template (adapt based on detected app):
   
   If app is mentioned in search results or user query:
   {"stepNumber": 0, "description": "Pre-flight: Let me verify I can see [App Name]. Please make sure [App Name] is open (desktop app or browser tab active).", "status": "pending"}
   
   Examples:
   - Slack workflow: "Pre-flight: Let me verify I can see Slack. Please make sure Slack is open (desktop app or browser tab active)."
   - Notion workflow: "Pre-flight: Let me verify I can see Notion. Please make sure Notion is open in your browser."
   - Code editor workflow: "Pre-flight: Let me verify I can see your code editor. Please make sure VSCode or your IDE is open."
   
   If no specific app mentioned:
   {"stepNumber": 0, "description": "Pre-flight: Let me verify I can see your screen. Please make sure the relevant application for this task is open and visible.", "status": "pending"}
   
   **WHY Step 0 matters:**
   - Ensures I can actually see the app before giving guidance
   - Allows user to open the app if it's not running
   - Prevents confusion from guidance that doesn't match their screen
   - Creates a natural checkpoint before starting the actual work
   
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ADAPTIVE COMPLEXITY: Analyze task complexity and adjust accordingly
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   LOW COMPLEXITY (3-5 steps, brief descriptions):
   ✓ Single app/tool interaction
   ✓ Linear workflow with no branching
   ✓ Explicit documentation available
   ✓ No prerequisite setup needed
   ✓ No system access required

   Examples: "Submit timesheet", "Update profile picture", "Send a Slack message"

   Step style: Brief and direct
     → "Open Workday"
     → "Click Time > Enter Time"
     → "Fill in hours and submit"

   Example JSON:
   [
     {"stepNumber": 0, "description": "Pre-flight: Let me verify I can see Workday. Please make sure Workday is open in your browser.", "status": "pending"},
     {"stepNumber": 1, "description": "Open Workday", "status": "pending"},
     {"stepNumber": 2, "description": "Click Time > Enter Time", "status": "pending"},
     {"stepNumber": 3, "description": "Fill in hours and submit", "status": "pending"}
   ]

   ---

   MEDIUM COMPLEXITY (5-8 steps, detailed descriptions):
   ✓ Multi-app/tool workflow
   ✓ Requires navigation through nested menus
   ✓ Partially documented (needs inference)
   ✓ Some setup required (credentials, permissions)

   Examples: "Update product roadmap", "Create new project in Jira", "Submit expense report"

   Step style: More specific about UI elements
     → "Open the #product-team channel in Slack"
     → "Click on the roadmap canvas at the top of the channel"
     → "Make your changes directly in the canvas"
     → "Post a message in the channel describing what you changed"

   Example JSON:
   [
     {"stepNumber": 0, "description": "Pre-flight: Let me verify I can see Slack. Please make sure Slack is open (desktop app or browser tab active).", "status": "pending"},
     {"stepNumber": 1, "description": "Open the #product-team channel in Slack", "status": "pending"},
     {"stepNumber": 2, "description": "Click on the roadmap canvas at the top of the channel", "status": "pending"},
     {"stepNumber": 3, "description": "Make your changes directly in the canvas", "status": "pending"},
     {"stepNumber": 4, "description": "Post a message describing what you changed and why", "status": "pending"}
   ]

   ---

   HIGH COMPLEXITY (8-12+ steps, very detailed descriptions):
   ✓ Abstract problem requiring decomposition (debugging, troubleshooting)
   ✓ Multi-system data flow tracing
   ✓ Fragmented/scattered documentation
   ✓ Requires credential access, tool switching
   ✓ Technical/engineering workflows

   Examples: "Debug why profiles aren't loading", "Diagnose payment processing failures", "Trace API request through system"

   Step style: Show full reasoning chain with context
     → "Open your code editor and navigate to the UserProfile component (UserProfile.tsx)"
     → "Find the ipcRenderer.send call that fetches user data (look for 'fetch-user-data' channel)"
     → "Open the main process code and locate the IPC handler for 'fetch-user-data'"
     → "Identify which API endpoint the handler calls (should be /api/users)"
     → [continues with 6-8 more detailed steps]

   Example JSON:
   [
     {"stepNumber": 0, "description": "Pre-flight: Let me verify I can see your code editor. Please make sure VSCode or your IDE is open with the project loaded.", "status": "pending"},
     {"stepNumber": 1, "description": "Open your code editor and navigate to the UserProfile component (UserProfile.tsx)", "status": "pending"},
     {"stepNumber": 2, "description": "Find the ipcRenderer.send call that fetches user data (look for 'fetch-user-data' channel)", "status": "pending"},
     {"stepNumber": 3, "description": "Open the main process code and locate the IPC handler for 'fetch-user-data'", "status": "pending"},
     {"stepNumber": 4, "description": "Identify which API endpoint the handler calls (should be /api/users)", "status": "pending"},
     {"stepNumber": 5, "description": "Open 1Password and locate the 'Production Access' credentials", "status": "pending"},
     {"stepNumber": 6, "description": "Log into AWS Console using those credentials", "status": "pending"},
     {"stepNumber": 7, "description": "Navigate to the CloudWatch service", "status": "pending"},
     {"stepNumber": 8, "description": "Select the 'prod-api-logs' log group", "status": "pending"},
     {"stepNumber": 9, "description": "Filter logs by '/api/users' endpoint and the timestamp when you saw the bug", "status": "pending"},
     {"stepNumber": 10, "description": "Look for error messages or failed requests that explain why profiles aren't loading", "status": "pending"}
   ]

   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DECISION TREE: Use this to determine complexity
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   Ask yourself:
   1. Is this debugging/troubleshooting? → HIGH complexity
   2. Does it involve 3+ different apps/systems? → MEDIUM-HIGH complexity
   3. Is the user's question abstract/vague? → HIGH complexity (need decomposition)
   4. Are search results fragmented? → MEDIUM-HIGH complexity (need synthesis)
   5. Is there explicit step-by-step documentation? → LOW complexity (just expand it)
   6. Is it a single-app linear workflow? → LOW complexity

   RULE: When in doubt, prefer MORE detail over less. Users can skip steps, but can't fill in missing information.

   Quality > Brevity. If your reasoning chain has 10 logical levels, create 10 steps.

   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   CRITICAL SYNTHESIS RULES:
   1. For abstract/complex problems: Break down systematically (identify → trace → access → analyze)
   2. For fragmented information: Connect dots through logical inference
   3. For explicit docs: Expand into detailed, actionable steps
   4. ONE action per step - NEVER combine multiple actions
   5. Use natural language like talking to a coworker

   STEP QUALITY REQUIREMENTS:
   ✅ Specific and actionable ("Open 1Password and locate 'Production Access'" NOT "Get credentials")
   ✅ Properly sequenced in logical order
   ✅ Progressive detail (more for complex UI, less for obvious UI)
   ✅ Grounded in search results (don't hallucinate tools/locations not mentioned)
   ✅ Natural phrasing ("Click the Settings gear icon in the top-right" NOT "Navigate to settings interface")

   STEP COUNT GUIDANCE (based on complexity assessment above):
   - LOW complexity: 3-5 steps
   - MEDIUM complexity: 5-8 steps
   - HIGH complexity: 8-12+ steps (reflects your reasoning depth)

   REMEMBER: You're creating the initial logical sequence. Later vision analysis will adapt it to what's actually on the user's screen and update step status as they progress.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate the complete JSON object now with ALL required fields.`;

      console.log("[VisualGuidanceAgent] Calling GPT-4 for workflow synthesis");

      // Call GPT-4 with JSON mode (no function calling)
      const response = await this.openai.chat.completions.create({
        model: config.openai.chatModel, // gpt-4-turbo-preview
        messages: [
          {
            role: "system",
            content: synthesisPrompt,
          },
          {
            role: "user",
            content: "Generate the complete JSON object with all required fields now.",
          },
        ],
        response_format: { type: "json_object" }, // Force JSON output
        temperature: 0.7,
        max_tokens: 2000,
      });

      // Parse GPT-4's response
      let aiGeneratedParams;
      try {
        aiGeneratedParams = JSON.parse(response.choices[0].message.content || "{}");
      } catch (parseError) {
        console.error("[VisualGuidanceAgent] Failed to parse GPT-4 response:", parseError);
        throw new Error("Failed to parse workflow JSON from GPT-4");
      }

      console.log("[VisualGuidanceAgent] GPT-4 synthesis received:", {
        hasSolution: !!aiGeneratedParams.solution,
        hasExplanation: !!aiGeneratedParams.solutionExplanation,
        hasSupportingDataExplanation: !!aiGeneratedParams.supportingDataExplanation,
        stepCount: aiGeneratedParams.stepList?.length || 0,
      });

      // STEP 3: Validate required fields (only those GPT-4 should generate)
      const missingFields: string[] = [];
      if (!aiGeneratedParams.solution || typeof aiGeneratedParams.solution !== "string") {
        missingFields.push("solution");
      }
      if (
        !aiGeneratedParams.solutionExplanation ||
        typeof aiGeneratedParams.solutionExplanation !== "string"
      ) {
        missingFields.push("solutionExplanation");
      }
      if (
        !aiGeneratedParams.supportingDataExplanation ||
        typeof aiGeneratedParams.supportingDataExplanation !== "string"
      ) {
        missingFields.push("supportingDataExplanation");
      }
      if (
        !aiGeneratedParams.stepList ||
        !Array.isArray(aiGeneratedParams.stepList) ||
        aiGeneratedParams.stepList.length === 0
      ) {
        missingFields.push("stepList");
      }

      if (missingFields.length > 0) {
        console.error(
          "[VisualGuidanceAgent] GPT-4 response missing critical fields:",
          missingFields,
          aiGeneratedParams
        );
        throw new Error(`Failed to generate workflow: Missing fields: ${missingFields.join(", ")}`);
      }

      // Validate stepList structure
      for (const step of aiGeneratedParams.stepList) {
        if (
          typeof step.stepNumber !== "number" ||
          !step.description ||
          typeof step.description !== "string" ||
          !step.status
        ) {
          console.error("[VisualGuidanceAgent] Invalid step structure:", step);
          throw new Error(
            "Invalid step structure in stepList: each step must have stepNumber (number), description (string), and status"
          );
        }
      }

      console.log("[VisualGuidanceAgent] Validation passed, preparing tool parameters:", {
        solution: aiGeneratedParams.solution.substring(0, 80) + "...",
        stepCount: aiGeneratedParams.stepList.length,
        supportingDataFromSearch: searchResult.sources?.length || 0,
      });

      // STEP 4: Combine AI-generated fields with data we already have
      const toolParams = {
        solution: aiGeneratedParams.solution,
        solutionExplanation: aiGeneratedParams.solutionExplanation,
        supportingData: searchResult.sources || [], // Use search results directly
        searchQuery: lastUserMessage.content, // Use original query directly
        supportingDataExplanation: aiGeneratedParams.supportingDataExplanation,
        stepList: aiGeneratedParams.stepList,
      };

      console.log("[VisualGuidanceAgent] Asking user if they want to start workflow");

      // STEP 5: Store the workflow parameters in context for when user confirms
      // We'll use the conversation history to retrieve this when user says "yes"
      context.workflowState = {
        ...toolParams,
        currentStepIndex: -1,
        adjustmentHistory: [],
      };

      const stepCount = aiGeneratedParams.stepList.length;
      const timeEstimate =
        stepCount <= 4 ? "~5 minutes" : stepCount <= 8 ? "~15 minutes" : "~30 minutes";

      const confirmationMessage = `Yes, I can help you with that! ${aiGeneratedParams.solutionExplanation}\n\nThis will take approximately ${timeEstimate} and involves ${stepCount} steps. Would you like me to guide you through it step-by-step?`;

      yield {
        type: "complete",
        messageType: "text",
        content: confirmationMessage,
        cardData: {
          _pendingWorkflow: toolParams, // Store for when user confirms
          _awaitingConfirmation: true,
        },
      };
    } catch (error) {
      console.error("[VisualGuidanceAgent] Error:", error);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error in visual guidance",
      };
    }
  }

  /**
   * Check if user message is vague (needs clarification)
   */
  private isVaguePrompt(message: string): boolean {
    const vaguePatterns = [
      /^how do i do this/i,
      /^help me with this/i,
      /^what should i click/i,
      /^how do i$/i,
      /^help$/i,
      /^guide me$/i,
    ];

    return vaguePatterns.some((pattern) => pattern.test(message.trim()));
  }

  /**
   * Classify workflow question type (visual vs conceptual)
   */
  private classifyWorkflowQuestion(message: string): "visual" | "conceptual" {
    const visualPatterns = [
      /i don't see/i,
      /where is/i,
      /the screen looks/i,
      /it's not showing/i,
      /i see .* instead/i,
      /can't find/i,
    ];

    const isVisual = visualPatterns.some((pattern) => pattern.test(message));
    return isVisual ? "visual" : "conceptual";
  }
}
