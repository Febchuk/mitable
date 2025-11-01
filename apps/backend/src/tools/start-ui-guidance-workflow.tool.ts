import { BaseTool, ToolContext, ToolParameters, ToolResult } from "./base.tool.js";
// import { geminiVisionService } from "../services/gemini-vision.service.js"; // Unused - commented out
// import { guideGenerationService } from "../services/guideGeneration.service.js"; // Unused - not called to avoid duplicate messages (see line 371)
import type { SolutionObject, EmbeddingMatch } from "@mitable/shared";

export class StartUIGuidanceWorkflowTool extends BaseTool {
  name = "start_ui_guidance_workflow";

  description = `Start an interactive UI guidance
  workflow when the user asks "How do I do [task]?"
  AND a screenshot is available.

  This tool initiates a multi-step workflow where
  the user progresses through steps one-by-one with
  visual guidance tailored to their current screen.

  WHEN TO USE:
  - User asks: "How do I [task]?" + screenshot present
  - User asks: "Show me how to..." + screenshot present
  - User asks: "Guide me through..." + screenshot present
  - User says: "step by step" or "walk me through" +
  screenshot present

  CRITICAL REQUIREMENTS:
  1. Screenshot MUST be available (reject without)
  2. ONLY call this AFTER search_knowledge - never first
  3. Pass complete search results as supportingData
  4. This creates the INITIAL workflow proposal

  YOUR ROLE: Act as an intelligent coworker who
  synthesizes fragmented company documentation into
  actionable step-by-step guidance through systematic
  reasoning.`;

  parameters: ToolParameters = {
    type: "object",
    properties: {
      solution: {
        type: "string",
        description: `High-level goal that directly addresses the user's question in natural, user-friendly language. This should reflect your REASONING about what the user needs to accomplish.

Examples:
  ✅ GOOD: "Debug why user profiles aren't loading by tracing the data flow from frontend to backend logs"
  ✅ GOOD: "Update the product roadmap canvas in the #product-team Slack channel"
  ❌ BAD: "Fix bug" (too vague)
  ❌ BAD: "Modify task descriptions in database" (too technical, not user-centric)`,
      },

      solutionExplanation: {
        type: "string",
        description: `Explain WHY this approach makes sense based on search results and your reasoning chain. This demonstrates your synthesis process.

For simple problems: Reference key search results that guided the approach.
For complex problems: Show your reasoning chain that connected fragmented information.

Examples:
  ✅ GOOD: "Based on messages in #product-team, the roadmap is maintained as a Slack canvas where the team collaborates openly. This follows the company's transparency culture from the Notion wiki."
  ✅ GOOD: "The search results show this is an Electron app with IPC-based communication. To debug profile loading, we need to trace: UserProfile.tsx → IPC channel → backend API → CloudWatch logs. AWS credentials are in 1Password per the team wiki."
  ❌ BAD: "The documentation says to do it this way."
  ❌ BAD: "This is how you fix bugs."`,
      },

      supportingData: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description:
                "Full text content from the source document - do NOT truncate or summarize",
            },
            source: {
              type: "string",
              description:
                "Source title/identifier (e.g., 'Slack #product-team', 'Notion Wiki: Onboarding')",
            },
            metadata: {
              type: "object",
              properties: {
                score: {
                  type: "number",
                  description: "Relevance score from search",
                },
              },
              additionalProperties: true,
            },
          },
          required: ["text", "source", "metadata"],
        },
        description: `CRITICAL: The COMPLETE, UNMODIFIED sources array from your search_knowledge results. This is non-negotiable.

REQUIREMENTS:
- Include ALL sources returned from search_knowledge
- Use FULL text field (not snippets or summaries)
- Preserve exact metadata including scores
- Do NOT filter, modify, or reorder

WHY THIS MATTERS:
- Grounds your solution in real company data (not hallucinations)
- Enables GeminiVision to reference original sources
- Provides audit trail for debugging incorrect guidance
- Shows users where the information came from

Extract directly from the sources array in search_knowledge response and pass through unchanged.`,
      },

      searchQuery: {
        type: "string",
        description: `The exact query you used in search_knowledge. Include this for transparency and debugging.

Simply provide the query string as-is, e.g., "product roadmap update" or "electron app profile loading debugging"`,
      },

      supportingDataExplanation: {
        type: "string",
        description: `Explain HOW the specific search results in supportingData support your solution. This proves you actually used the search results to synthesize your steps, not just hallucinated them.

Connect the dots: Show which search results informed which parts of your stepList.

Examples:
  ✅ GOOD: "The Slack message from #product-team reveals the canvas location (step 1-2), while the Notion transparency doc explains why we notify the team after changes (step 4)."
  ✅ GOOD: "The GitHub README identifies the Electron architecture (informs steps 1-3), the #engineering Slack shows the API endpoint (step 4), Confluence provides the CloudWatch location (steps 6-8), and the email mentions 1Password credentials (step 5)."
  ❌ BAD: "These docs are relevant to the task."
  ❌ BAD: "The search results contain information about the solution."

This field is your proof of intelligent synthesis - show your work.`,
      },

      stepList: {
        type: "array",
        items: {
          type: "object",
          properties: {
            stepNumber: {
              type: "number",
              description: "Sequential step number starting from 1",
            },
            description: {
              type: "string",
              description: "Clear, actionable description of this single step in natural language",
            },
            status: {
              type: "string",
              enum: ["pending", "current", "completed"],
              description: "Initial status - always set to 'pending' since user hasn't started yet",
            },
          },
          required: ["stepNumber", "description", "status"],
        },
        description: `Ordered list of actionable steps synthesized through intelligent reasoning. This is the CORE of your synthesis.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADAPTIVE COMPLEXITY: Analyze task complexity and adjust accordingly
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMPLEXITY INDICATORS:

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

STEP STRUCTURE:
- stepNumber: Sequential (1, 2, 3...)
- description: The actionable instruction
- status: Always "pending" initially (GeminiVision will update as user progresses)

EXAMPLES OF PROPER GRANULARITY:

✅ GOOD (Simple Task):
[
  {stepNumber: 1, description: "Open the #product-team channel in Slack", status: "pending"},
  {stepNumber: 2, description: "Click on the roadmap canvas in the channel", status: "pending"},
  {stepNumber: 3, description: "Make your changes directly in the canvas", status: "pending"},
  {stepNumber: 4, description: "Post a message describing what you changed and why", status: "pending"}
]

✅ GOOD (Complex Debugging - shows multi-level reasoning):
[
  {stepNumber: 1, description: "Open your code editor and navigate to the UserProfile component (UserProfile.tsx)", status: "pending"},
  {stepNumber: 2, description: "Find the ipcRenderer.send call that fetches user data (look for 'fetch-user-data' channel)", status: "pending"},
  {stepNumber: 3, description: "Open the main process code and locate the IPC handler for 'fetch-user-data'", status: "pending"},
  {stepNumber: 4, description: "Identify which API endpoint the handler calls (should be /api/users)", status: "pending"},
  {stepNumber: 5, description: "Open 1Password and locate the 'Production Access' credentials", status: "pending"},
  {stepNumber: 6, description: "Log into AWS Console using those credentials", status: "pending"},
  {stepNumber: 7, description: "Navigate to the CloudWatch service", status: "pending"},
  {stepNumber: 8, description: "Select the 'prod-api-logs' log group", status: "pending"},
  {stepNumber: 9, description: "Filter logs by '/api/users' endpoint and the timestamp when you saw the bug", status: "pending"},
  {stepNumber: 10, description: "Look for error messages or failed requests that explain why profiles aren't loading", status: "pending"}
]

❌ BAD:
[
  {stepNumber: 1, description: "Go to Slack and open the product team channel and find the roadmap", status: "pending"},
  {stepNumber: 2, description: "Update it", status: "pending"}
]
Why bad: Multiple actions per step, vague descriptions

❌ BAD:
[
  {stepNumber: 1, description: "Check the code for bugs", status: "pending"},
  {stepNumber: 2, description: "Look at logs", status: "pending"}
]
Why bad: Doesn't show reasoning chain, not actionable, skips critical steps

STEP COUNT GUIDANCE (based on complexity assessment above):
- LOW complexity: 3-5 steps
- MEDIUM complexity: 5-8 steps
- HIGH complexity: 8-12+ steps (reflects your reasoning depth)

Quality over brevity - if your reasoning chain has 10 logical levels, your stepList should have ~10 steps. Don't artificially compress.

REMEMBER: You're creating the initial logical sequence. GeminiVision will adapt it to what's actually on screen and update status as user progresses.`,
      },
    },
    required: [
      "solution",
      "solutionExplanation",
      "supportingData",
      "searchQuery",
      "supportingDataExplanation",
      "stepList",
    ],
  };

  async execute(args: Partial<SolutionObject>, context: ToolContext): Promise<ToolResult> {
    this.validate(args);

    // Defensive validation: Check all required fields are present and non-empty
    const missingFields: string[] = [];
    if (!args.solution || args.solution.trim().length === 0) missingFields.push("solution");
    if (!args.solutionExplanation || args.solutionExplanation.trim().length === 0)
      missingFields.push("solutionExplanation");
    if (!args.supportingData || args.supportingData.length === 0)
      missingFields.push("supportingData");
    if (!args.searchQuery || args.searchQuery.trim().length === 0)
      missingFields.push("searchQuery");
    if (!args.supportingDataExplanation || args.supportingDataExplanation.trim().length === 0)
      missingFields.push("supportingDataExplanation");
    if (!args.stepList || args.stepList.length === 0) missingFields.push("stepList");

    if (missingFields.length > 0) {
      console.error("[StartUIGuidanceWorkflowTool] Missing required fields:", missingFields);
      return {
        messageType: "text",
        content: `Tool call incomplete. Missing or empty required fields: ${missingFields.join(", ")}. Please call start_ui_guidance_workflow again with all required parameters properly filled out.`,
        streamable: true,
      };
    }

    console.log("[StartUIGuidanceWorkflowTool] Execute:", args.solution);

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

    // For initial proposal: ALL steps are "pending", currentStepIndex is -1 (not started)
    // This shows a PREVIEW of the workflow without starting execution
    const solutionObject: SolutionObject = {
      solution: args.solution!,
      supportingData: args.supportingData as EmbeddingMatch[],
      solutionExplanation: args.solutionExplanation!,
      supportingDataExplanation: args.supportingDataExplanation!,
      stepList: args.stepList!.map((s) => ({
        ...s,
        status: "pending", // All steps pending for initial proposal
      })),
      currentStepIndex: -1, // -1 means workflow not started yet (preview mode)
      searchQuery: args.searchQuery!,
      adjustmentHistory: [],
    };

    // Calculate estimated time based on number of steps (rough estimate: 2-3 min per step)
    const estimatedMinutes = solutionObject.stepList.length * 2.5;
    const timeEstimate =
      estimatedMinutes < 60
        ? `${Math.round(estimatedMinutes)} minutes`
        : `${Math.round(estimatedMinutes / 60)} hour${estimatedMinutes >= 120 ? "s" : ""}`;

    // Generate a preview message explaining the plan (NO visual analysis yet)
    const previewMessage = `I'll guide you through updating the product roadmap. This will take approximately ${timeEstimate} and involves ${solutionObject.stepList.length} steps:\n\n${solutionObject.solutionExplanation}\n\nWhen you're ready, click "Yes, let's get started!" below to begin.`;

    console.log("[StartUIGuidanceWorkflowTool] Created workflow preview:", {
      stepCount: solutionObject.stepList.length,
      estimatedTime: timeEstimate,
      currentStepIndex: solutionObject.currentStepIndex,
      allStepsPending: solutionObject.stepList.every((s) => s.status === "pending"),
    });

    // ✅ Phase 2A: Return proposal as text with lightweight cardData
    // Full workflow will be created in workflow_sessions when user confirms
    return {
      messageType: "text",
      content: previewMessage,
      cardData: {
        _pendingWorkflow: solutionObject,
        _awaitingConfirmation: true,
      } as any, // Metadata for workflow proposal, not strict SolutionObject
      streamable: true,
    };
  }
}
