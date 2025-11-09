/**
 * Demo Workflow Configuration
 *
 * This file contains hardcoded workflow steps and responses for demo purposes.
 * When DEMO_MODE is enabled, the VisualGuidanceAgent will use these predefined
 * responses instead of dynamically generating them via AI.
 */

import type { SolutionObject, Step } from "@mitable/shared";

export const DEMO_MODE = process.env.DEMO_MODE === "true";

/**
 * Hardcoded workflow steps for the demo
 */
export const DEMO_WORKFLOW_STEPS: Step[] = [
  {
    stepNumber: 1,
    description: "Launch your IDE",
    status: "pending",
  },
  {
    stepNumber: 2,
    description: "Open your terminal in your IDE",
    status: "pending",
  },
  {
    stepNumber: 3,
    description: "Launch Claude Code",
    status: "pending",
  },
  {
    stepNumber: 4,
    description: "Turn on auto-accept in Claude Code",
    status: "pending",
  },
  {
    stepNumber: 5,
    description: "Get Claude to install the dependencies and run the dev server",
    status: "pending",
  },
  {
    stepNumber: 6,
    description: "Get mock username and password",
    status: "pending",
  },
];

/**
 * Initial workflow solution object
 */
export const DEMO_WORKFLOW_SOLUTION: Omit<SolutionObject, "currentStepIndex" | "adjustmentHistory"> = {
  solution: "Set up your local development environment",
  solutionExplanation:
    "This workflow will guide you through launching your IDE, setting up your terminal, installing dependencies, and accessing the development environment with test credentials.",
  stepList: DEMO_WORKFLOW_STEPS,
  supportingData: [
    {
      text: "Demo environment setup guide: Launch VSCode, open terminal with Ctrl+`, run Claude Code, enable auto-accept, start dev server, and use test credentials from Slack.",
      source: "Demo Documentation",
      metadata: {
        score: 1.0,
        sourceType: "demo",
      },
    },
  ],
  supportingDataExplanation: "This is a guided walkthrough for environment setup based on our standard onboarding process.",
  searchQuery: "How do I set up my local development environment?",
};

/**
 * Step progression messages - what the agent says when moving to each step
 */
export const DEMO_STEP_PROGRESSION_MESSAGES: Record<number, string> = {
  1: "I can see that you currently have Notion open, but to move forward you need to open VSCode from your dock.",
  2: "Great, you opened VSCode! Now use the keyboard shortcut ⌃ + ` (control + backtick) to open your terminal.",
  3: "Now in your terminal, literally just type in \"claude\"",
  4: "Use the keyboard shortcut shift + tab to allow Claude run terminal commands automatically.",
  5: 'Paste this message into the Claude Code chat bar "Start the development server for me. Make sure that all of the necessary dependencies are installed before as due diligence"',
  6: "Great, I can see that the dev app loaded successfully! Now, open [this message](https://mitableai.slack.com/archives/C09C8B5ANTY/p1761073540624099?thread_ts=1760617155.954479&cid=C09C8B5ANTY) in Slack to find the mock username and password to log in with.",
};

/**
 * Custom question responses - predefined Q&A for specific steps
 * Structure: { stepIndex: { userQuestion: agentResponse } }
 */
export const DEMO_CUSTOM_QUESTION_RESPONSES: Record<number, Record<string, string>> = {
  4: {
    "What is the point of this step?":
      "Great question! Without this step you'd have to accept every single command that Claude wants to run in your terminal one by one, which slows things down. This is a great example of when to just ask AI to do something for you because the alternative would have been finding the commands and putting them in one by one.",
    "what is the point of this step":
      "Great question! Without this step you'd have to accept every single command that Claude wants to run in your terminal one by one, which slows things down. This is a great example of when to just ask AI to do something for you because the alternative would have been finding the commands and putting them in one by one.",
    "why do i need this":
      "Great question! Without this step you'd have to accept every single command that Claude wants to run in your terminal one by one, which slows things down. This is a great example of when to just ask AI to do something for you because the alternative would have been finding the commands and putting them in one by one.",
  },
  6: {
    "This just took me to a message. Why can't I see any login details?":
      "Ah I see! You need to open the TEST_ACCOUNTS.md file at the top of the thread to find what you're looking for!",
    "this just took me to a message. why can't i see any login details":
      "Ah I see! You need to open the TEST_ACCOUNTS.md file at the top of the thread to find what you're looking for!",
    "where are the login details":
      "Ah I see! You need to open the TEST_ACCOUNTS.md file at the top of the thread to find what you're looking for!",
    "i don't see the credentials":
      "Ah I see! You need to open the TEST_ACCOUNTS.md file at the top of the thread to find what you're looking for!",
  },
};

/**
 * Fallback response for custom questions not in the predefined list
 */
export const DEMO_CUSTOM_QUESTION_FALLBACK =
  "That's a great question! For this demo, I can help with specific questions about the current step. Try asking something directly related to what you're seeing on screen.";

/**
 * Helper function to get step progression message
 */
export function getDemoStepMessage(stepIndex: number): string {
  return DEMO_STEP_PROGRESSION_MESSAGES[stepIndex] || "Let's continue with this step.";
}

/**
 * Helper function to find matching custom question response
 * Uses case-insensitive matching and handles variations
 */
export function getDemoCustomQuestionResponse(stepIndex: number, userQuestion: string): string {
  const normalizedQuestion = userQuestion.toLowerCase().trim();
  const stepResponses = DEMO_CUSTOM_QUESTION_RESPONSES[stepIndex];

  if (!stepResponses) {
    return DEMO_CUSTOM_QUESTION_FALLBACK;
  }

  // Try exact match first
  if (stepResponses[normalizedQuestion]) {
    return stepResponses[normalizedQuestion];
  }

  // Try partial match - check if any predefined question is contained in user's question
  for (const [question, response] of Object.entries(stepResponses)) {
    if (normalizedQuestion.includes(question) || question.includes(normalizedQuestion)) {
      return response;
    }
  }

  return DEMO_CUSTOM_QUESTION_FALLBACK;
}

/**
 * Helper function to create initial demo workflow SolutionObject
 */
export function createDemoWorkflowSolution(): SolutionObject {
  return {
    ...DEMO_WORKFLOW_SOLUTION,
    currentStepIndex: -1, // Pre-flight state
    adjustmentHistory: [],
    stepList: DEMO_WORKFLOW_STEPS.map((step) => ({ ...step })), // Deep copy
  };
}
