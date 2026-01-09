import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import { BaseAgent } from "./base.agent";
import { KnowledgeAgent } from "./knowledge.agent";
import { TextResponseAgent } from "./text-response.agent";
import type { StreamChunk, ToolContext } from "../tools/base.tool";
import { ClarifyIntentTool } from "../tools/clarify-intent.tool";
import { StartUIGuidanceWorkflowTool } from "../tools/start-ui-guidance-workflow.tool";
import { GuideNextStepTool } from "../tools/guide-next-step.tool";
import { AnalyzeWorkflowScreenTool } from "../tools/analyze-workflow-screen.tool";

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
  private gemini: GoogleGenerativeAI;
  private knowledgeAgent: KnowledgeAgent;
  private textAgent: TextResponseAgent;
  private clarifyIntentTool: ClarifyIntentTool;
  private startWorkflowTool: StartUIGuidanceWorkflowTool;
  private guideNextStepTool: GuideNextStepTool;
  private analyzeScreenTool: AnalyzeWorkflowScreenTool;

  constructor(knowledgeAgent: KnowledgeAgent, textAgent: TextResponseAgent) {
    super();
    this.openai = new OpenAI({ apiKey: config.openai.apiKey });
    this.gemini = new GoogleGenerativeAI(config.gemini.apiKey);
    this.knowledgeAgent = knowledgeAgent;
    this.textAgent = textAgent;
    this.clarifyIntentTool = new ClarifyIntentTool();
    this.startWorkflowTool = new StartUIGuidanceWorkflowTool();
    this.guideNextStepTool = new GuideNextStepTool();
    this.analyzeScreenTool = new AnalyzeWorkflowScreenTool();
  }

  /**
   * Execute visual guidance workflow
   */
  async *execute(context: ToolContext): AsyncIterable<StreamChunk> {
    try {
      // Check if screenshot is available
      if (!context.screenshots || context.screenshots.length === 0) {
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
      if (context.metadata?.workflowAction === "progress_step") {
        // User clicked "Move on to next step" - progress workflow
        const result = await this.guideNextStepTool.execute(
          {
            conversationId: context.conversationId,
          },
          context
        );

        yield {
          type: "complete",
          messageType: result.messageType,
          content: result.content,
          cardData: result.cardData,
          windowTrigger: result.triggerWindow,
        };
        return;
      }

      // Detect step-level custom questions during an active workflow
      const isWorkflowCustomQuestion =
        !!context.workflowState &&
        context.workflowState.currentStepIndex >= 0 &&
        context.metadata?.workflowAction === "custom_question";

      // Only run vague-prompt → clarify_intent for non-workflow or pre-flight cases
      const isVaguePrompt = isWorkflowCustomQuestion
        ? false
        : await this.isVaguePrompt(lastUserMessage.content);

      if (!isWorkflowCustomQuestion && isVaguePrompt) {
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
      if (context.workflowState) {
        const questionType = await this.classifyWorkflowQuestion(lastUserMessage.content);

        console.log(`[VisualGuidanceAgent] Routing workflow question: ${questionType}`, {
          question: lastUserMessage.content.substring(0, 100),
        });

        if (questionType === "visual") {
          // Visual/UI issue - use analyze_workflow_screen
          const result = await this.analyzeScreenTool.execute(
            {
              conversationId: context.conversationId,
              issue: lastUserMessage.content,
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

        if (questionType === "directly_answerable") {
          // Basic question - use TextResponseAgent (workflow-aware)
          // TextResponseAgent will automatically use context.workflowState and
          // wrapWithWorkflowState to preserve workflow UI state
          console.log("[VisualGuidanceAgent] Delegating to TextResponseAgent (workflow-aware)");

          for await (const chunk of this.textAgent.execute(context)) {
            yield chunk;
          }
          return;
        }

        // knowledge_search - delegate to KnowledgeAgent for synthesized response
        // KnowledgeAgent.execute() will:
        // 1. Search knowledge base
        // 2. Synthesize results with GPT-4 into conversational response
        // 3. Wrap with workflow state automatically
        // 4. Stream the response
        console.log(
          "[VisualGuidanceAgent] Delegating to KnowledgeAgent for synthesized knowledge search"
        );

        for await (const chunk of this.knowledgeAgent.execute(context)) {
          yield chunk;
        }
        return;
      }

      // Start new workflow: STEP 1 - Search knowledge, STEP 2 - Synthesize workflow with GPT-4
      console.log("[VisualGuidanceAgent] Starting knowledge-grounded workflow");

      // Emit progress event: Searching knowledge base
      yield {
        type: "progress",
        progress: {
          phase: "searching",
          message: "Searching knowledge base...",
        },
      };

      // STEP 1: Call KnowledgeAgent for company documentation
      const searchResult = await this.knowledgeAgent.search(lastUserMessage.content, context);

      console.log("[VisualGuidanceAgent] Search complete:", {
        query: lastUserMessage.content.substring(0, 100),
        sourcesFound: searchResult.sources?.length || 0,
      });

      // STEP 1.5: Quick screen analysis - What app is visible?
      console.log("[VisualGuidanceAgent] Analyzing visible application on screen...");

      let visibleApp = "Unknown";
      try {
        const visionModel = this.gemini.getGenerativeModel({
          model: "gemini-2.5-flash",
        });

        const base64Data = context.screenshots[0].dataUrl.replace(/^data:image\/\w+;base64,/, "");

        const screenAnalysisPrompt = `Look at this screenshot and identify:
1. What application/program is currently visible and focused?
2. Is it a desktop/finder view or an application?

Return ONLY the app name (e.g., "Spotify", "Slack", "Chrome", "Desktop", "Finder"), nothing else.`;

        const screenAnalysis = await visionModel.generateContent([
          screenAnalysisPrompt,
          {
            inlineData: {
              mimeType: "image/png",
              data: base64Data,
            },
          },
        ]);

        visibleApp = screenAnalysis.response.text().trim();
        console.log("[VisualGuidanceAgent] ✅ Visible app detected:", visibleApp);
      } catch (error) {
        console.warn(
          "[VisualGuidanceAgent] ⚠️ Screen analysis failed, continuing without app context:",
          error instanceof Error ? error.message : "Unknown error"
        );
        visibleApp = "Unknown";
      }

      // STEP 2: Use GPT-4 to synthesize search results into structured workflow
      // Note: We only ask GPT-4 to generate fields requiring synthesis
      // (solution, explanations, steps). We'll pass supportingData and searchQuery directly.
      const synthesisPrompt = `You are creating step-by-step UI guidance for an employee based on company documentation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 CRITICAL CONTEXT - CURRENT SCREEN STATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VISIBLE APPLICATION: ${visibleApp}

⚠️ MANDATORY RULES FOR APP SELECTION:

1. **PRIORITIZE VISIBLE APP** - If the visible app (${visibleApp}) CAN accomplish the user's task, USE IT
   - Example: User asks about "playlist" + Spotify is visible → CREATE SPOTIFY WORKFLOW
   - Example: User asks about "message" + Slack is visible → CREATE SLACK WORKFLOW
   - DO NOT redirect to another app just because search results mention it

2. **SEMANTIC CONTEXT MATTERS** - Understand what apps naturally handle which tasks:
   - "playlist", "music", "song", "album" → Spotify, Apple Music, etc.
   - "message", "channel", "DM" → Slack, Teams, Email, etc.
   - "document", "doc", "sheet" → Google Drive, Notion, etc.
   - If ${visibleApp} matches the semantic domain of the task, USE IT

3. **SEARCH RESULTS ARE CONTEXT, NOT COMMANDS**:
   - If search mentions "Slack message about playlists" but Spotify is visible → USE SPOTIFY
   - Search results provide background information, not workflow instructions
   - Don't create workflows in the wrong app just because search found it there

4. **ONLY SUGGEST SWITCHING APPS IF**:
   - The visible app CANNOT accomplish the task at all
   - The task explicitly requires a different specific app (e.g., "update my Jira ticket")
   - The user explicitly mentions a different app in their question

5. **IF WRONG APP IS VISIBLE**:
   - Step 1 MUST be: "Open [correct app name]"
   - Then proceed with the rest of the workflow in the correct app
   - Example: User asks about "Jira ticket" but Spotify visible → Step 1: "Open Jira"

6. **CONFIDENCE IN APP DETECTION**:
   - If visibleApp is "Unknown" or "Desktop", rely more heavily on search results
   - If visibleApp is a specific application, STRONGLY PREFER using it if semantically relevant

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
   - stepNumber (number): Sequential starting from 1
   - description (string): Clear, actionable instruction
   - status (string): Always "pending" initially

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

      // Emit progress event: Generating workflow
      yield {
        type: "progress",
        progress: {
          phase: "generating",
          message: "Generating step-by-step guide...",
        },
      };

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

      console.log("[VisualGuidanceAgent] 📊 Synthesis context used:", {
        userQuestion: lastUserMessage.content,
        visibleApp: visibleApp,
        searchResultCount: searchResult.sources?.length || 0,
        firstStepUsesVisibleApp:
          aiGeneratedParams.stepList?.[0]?.description
            .toLowerCase()
            .includes(visibleApp.toLowerCase()) || false,
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

      console.log("[VisualGuidanceAgent] Executing workflow tool with combined parameters");

      // STEP 5: Execute tool with complete parameters
      const workflowResult = await this.startWorkflowTool.execute(toolParams, context);

      yield {
        type: "complete",
        messageType: workflowResult.messageType,
        content: workflowResult.content,
        cardData: workflowResult.cardData,
        windowTrigger: workflowResult.triggerWindow,
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
   *
   * Uses Gemini Flash to detect if the prompt text itself lacks specificity
   * about what task the user wants to accomplish. Falls back to regex patterns
   * if inference fails.
   *
   * Vague prompts examples:
   * - "How do I do this?" (no task specified)
   * - "Help me" (no context about what they need help with)
   * - "What should I click?" (no goal stated)
   *
   * Specific prompts examples:
   * - "How do I update the product roadmap?" (clear task)
   * - "Help me send a Slack message" (clear goal)
   * - "What should I click to submit my timesheet?" (clear intent)
   */
  private async isVaguePrompt(message: string): Promise<boolean> {
    try {
      const model = this.gemini.getGenerativeModel({
        model: "gemini-2.5-flash",
      });

      const prompt = `Analyze if this user prompt is VAGUE or SPECIFIC.

A prompt is VAGUE if:
- It uses words like "this" or "that" without explaining what they refer to
- It asks for help without specifying what task or goal they need help with
- It's extremely short (1-3 words like "help", "how?", "guide me")
- The user assumes you know their intent but hasn't stated it explicitly

A prompt is SPECIFIC if:
- It clearly states a task or goal (e.g., "update the roadmap", "send a message", "submit timesheet")
- It provides enough context that you could understand their intent even without additional information
- The action they want to take is explicitly mentioned

User prompt: "${message}"

Respond with ONLY one word: vague OR specific
Nothing else.`;

      const result = await model.generateContent(prompt);
      const response = result.response.text().trim().toLowerCase();

      console.log(`[VisualGuidanceAgent] Vague prompt inference: "${message}" → ${response}`);

      return response === "vague";
    } catch (error) {
      console.warn(
        "[VisualGuidanceAgent] Inference failed for vague prompt detection, falling back to regex:",
        error instanceof Error ? error.message : "Unknown error"
      );

      // Fallback to regex patterns on error
      return this.isVaguePromptRegex(message);
    }
  }

  /**
   * Fallback regex-based vague prompt detection
   *
   * Used when Gemini Flash inference fails (API errors, rate limits, etc.)
   * Provides basic pattern matching as a safety net.
   */
  private isVaguePromptRegex(message: string): boolean {
    const vaguePatterns = [
      /^how do i do this/i,
      /^help me with this/i,
      /^what should i click/i,
      /^how do i$/i,
      /^help$/i,
      /^guide me$/i,
    ];

    const isVague = vaguePatterns.some((pattern) => pattern.test(message.trim()));

    console.log(`[VisualGuidanceAgent] Vague prompt regex fallback: "${message}" → ${isVague}`);

    return isVague;
  }

  /**
   * Classify workflow question type (visual/knowledge_search/directly_answerable)
   *
   * Uses Gemini Flash to determine how to handle a question during an active workflow.
   * Falls back to regex patterns if inference fails.
   *
   * VISUAL - Requires screenshot analysis:
   * - "I don't see the canvas button" (can't find UI element)
   * - "Where is the submit button?" (need to locate on screen)
   * - "The screen looks different" (mismatch between expectation and reality)
   * - "I see a menu instead of a button" (unexpected UI state)
   *
   * KNOWLEDGE_SEARCH - Requires searching company documentation:
   * - Questions about company-specific features, policies, or processes
   * - Questions that might have recent updates or detailed documentation
   * - "What's our policy on X?"
   * - "How does [specific feature] work in our company?"
   *
   * DIRECTLY_ANSWERABLE - Can answer from cached workflow context:
   * - "Why do I need to do this step?" (workflow has solutionExplanation)
   * - "What is this step for?" (can reference current step description)
   * - "Is this step required?" (can infer from workflow structure)
   * - "Can I skip this?" (can reason about dependencies)
   * - Acknowledgments ("ok", "got it", "thanks")
   */
  private async classifyWorkflowQuestion(
    message: string
  ): Promise<"visual" | "knowledge_search" | "directly_answerable"> {
    try {
      const model = this.gemini.getGenerativeModel({
        model: "gemini-2.5-flash",
      });

      const prompt = `Classify this user question during an active UI workflow.

VISUAL - Requires looking at their screen:
- Can't find UI element ("I don't see X", "Where is Y?")
- Screen doesn't match description ("Looks different", "I see A instead of B")
- Need help locating something ("Which button?", "Can't find X")

KNOWLEDGE_SEARCH - Requires searching company documentation:
- Asking about company-specific features, policies, or processes not in current workflow context
- Questions that might have recent updates or detailed documentation elsewhere
- "How does [feature] work in our company?"
- "What's our policy on X?"
- Questions about features or concepts that need more than workflow context

DIRECTLY_ANSWERABLE - Can answer from current workflow context:
- "Why do I need to do this step?" (workflow has solutionExplanation)
- "What is this step for?" (can reference current step description)
- "Is this step required?" (can infer from workflow structure)
- "Can I skip this?" (can reason about step dependencies)
- Simple acknowledgments ("ok", "got it", "thanks", "I understand")

User question: "${message}"

Respond with ONLY one of these three words: visual OR knowledge_search OR directly_answerable
Nothing else.`;

      const result = await model.generateContent(prompt);
      const response = result.response.text().trim().toLowerCase();

      console.log(
        `[VisualGuidanceAgent] Workflow question classification: "${message}" → ${response}`
      );

      // Validate and return response
      if (response === "visual") return "visual";
      if (response === "knowledge_search") return "knowledge_search";
      if (response === "directly_answerable") return "directly_answerable";

      // Default to knowledge_search if invalid response (safer to over-search than under-search)
      console.warn(
        `[VisualGuidanceAgent] Invalid classification response: "${response}", defaulting to knowledge_search`
      );
      return "knowledge_search";
    } catch (error) {
      console.warn(
        "[VisualGuidanceAgent] Inference failed for workflow question classification, falling back to regex:",
        error instanceof Error ? error.message : "Unknown error"
      );

      return this.classifyWorkflowQuestionRegex(message);
    }
  }

  /**
   * Fallback regex-based workflow question classification
   *
   * Used when Gemini Flash inference fails (API errors, rate limits, etc.)
   * Provides basic pattern matching as a safety net.
   *
   * Note: Regex can only detect visual patterns reliably.
   * Defaults to knowledge_search for safety (better to over-search than under-search).
   */
  private classifyWorkflowQuestionRegex(
    message: string
  ): "visual" | "knowledge_search" | "directly_answerable" {
    const visualPatterns = [
      /i don't see/i,
      /where is/i,
      /the screen looks/i,
      /it's not showing/i,
      /i see .* instead/i,
      /can't find/i,
    ];

    const isVisual = visualPatterns.some((pattern) => pattern.test(message));

    if (isVisual) {
      console.log(`[VisualGuidanceAgent] Workflow question regex fallback: "${message}" → visual`);
      return "visual";
    }

    // Default to knowledge_search for safety (can't reliably distinguish between
    // knowledge_search and directly_answerable with regex)
    console.log(
      `[VisualGuidanceAgent] Workflow question regex fallback: "${message}" → knowledge_search (default)`
    );
    return "knowledge_search";
  }
}
