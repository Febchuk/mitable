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
    description: "Identify equipment requiring sizing",
    status: "pending",
  },
  {
    stepNumber: 2,
    description: "Establish flow assumptions and size the vessel",
    status: "pending",
  },
  {
    stepNumber: 3,
    description: "Size control valves and piping",
    status: "pending",
  },
];

/**
 * Initial workflow solution object
 */
export const DEMO_WORKFLOW_SOLUTION: Omit<SolutionObject, "currentStepIndex" | "adjustmentHistory"> = {
  solution: "Analyze P&ID for pre-FEED estimation",
  solutionExplanation:
    "This workflow will guide you through analyzing a three-phase separator P&ID for pre-FEED estimation, including identifying equipment requiring sizing, establishing flow assumptions, and sizing the vessel and control systems.",
  stepList: DEMO_WORKFLOW_STEPS,
  supportingData: [
    {
      title: "Pre-FEED P&ID Analysis Guide",
      url: "https://docs.engineering.example.com/pre-feed-analysis",
      snippet: "Pre-FEED P&ID analysis guide: Identify major equipment (separator vessel, control valves, instrumentation), establish typical flow assumptions (oil, water, gas rates), size vessel based on retention time, and size control valves and piping per API velocity limits.",
    },
  ],
  supportingDataExplanation: "This is a guided walkthrough for pre-FEED P&ID analysis based on upstream oil & gas engineering standards.",
  searchQuery: "Help me analyze this P&ID for pre-FEED estimation",
};

/**
 * Step progression messages - what the agent says when moving to each step
 */
export const DEMO_STEP_PROGRESSION_MESSAGES: Record<number, string> = {
  1: "I can see you have a three-phase separator P&ID open. For your pre-FEED estimate, here's what needs sizing:\n\n• Separator vessel (horizontal cylinder)\n• 3 control valves - vapor, oil, and water outlets\n• Instrumentation - PT, 2× LT, PC, 2× LC\n• Manual isolation valves on each line\n\nThe vessel is your starting point since everything else depends on it. Ready to move forward?",
  2: "Now let's size the vessel. Since you don't have actual flow rates yet, we'll work with typical ranges. For upstream separators like this, here are the standard assumptions:\n\n**Flow assumptions:**\n• Oil: 2,000 BPD\n• Water cut: 40% → Water: 800 BPD\n• Total liquid: 2,800 BPD\n• Gas: 2 MMSCFD\n• Pressure: 150 psig, Temp: 80°F\n• Retention time: 4 minutes\n\nFor pre-FEED, we typically use 40-60% water cut assumptions unless there's well test data. Most engineers underestimate this and end up having to revise later.\n\nDo these assumptions look reasonable for this field?",
  3: "Now for the piping and control valves. Based on your flow rates and sticking to API velocity limits (gas: 50-100 ft/s, liquids: 5-10 ft/s), here are the sizes:\n\n• Vapor outlet: 6\" line, 6\" control valve\n• Oil outlet: 4\" line, 4\" control valve\n• Water outlet: 3\" line, 3\" control valve\n• Inlet: 6\" (handles multiphase flow)\n\nThese follow what the team calls the \"2-second rule\" - basically, fluids should be able to exit the vessel in 2-10 seconds during upsets.",
};

/**
 * Custom question responses - predefined Q&A for specific steps
 * Structure: { stepIndex: { userQuestion: agentResponse } }
 */
export const DEMO_CUSTOM_QUESTION_RESPONSES: Record<number, Record<string, string>> = {
  1: {
    "Wait, what about the other stuff I see inside the vessel? Don't those need sizing too?":
      "Ah, you're referring to the demister pad at the top, the weir in the middle, and the vortex breakers at the bottom outlets that I can see on your P&ID.\n\nGood eye, but I left those out intentionally - they're vendor-furnished internals. The vessel manufacturer sizes these based on your flow rates. In pre-FEED, just note: \"Vessel to include internals per API 12J\"\n\nActually, I'm seeing from our Shell project debrief last month that a junior engineer spent three days sizing internals that the vendor completely redid. Your manager flagged it as wasted time. Focus on vessel dimensions and control systems instead - that's where your engineering time actually matters.",
    "what about the other stuff i see inside the vessel":
      "Ah, you're referring to the demister pad at the top, the weir in the middle, and the vortex breakers at the bottom outlets that I can see on your P&ID.\n\nGood eye, but I left those out intentionally - they're vendor-furnished internals. The vessel manufacturer sizes these based on your flow rates. In pre-FEED, just note: \"Vessel to include internals per API 12J\"\n\nActually, I'm seeing from our Shell project debrief last month that a junior engineer spent three days sizing internals that the vendor completely redid. Your manager flagged it as wasted time. Focus on vessel dimensions and control systems instead - that's where your engineering time actually matters.",
    "don't those need sizing too":
      "Ah, you're referring to the demister pad at the top, the weir in the middle, and the vortex breakers at the bottom outlets that I can see on your P&ID.\n\nGood eye, but I left those out intentionally - they're vendor-furnished internals. The vessel manufacturer sizes these based on your flow rates. In pre-FEED, just note: \"Vessel to include internals per API 12J\"\n\nActually, I'm seeing from our Shell project debrief last month that a junior engineer spent three days sizing internals that the vendor completely redid. Your manager flagged it as wasted time. Focus on vessel dimensions and control systems instead - that's where your engineering time actually matters.",
  },
  2: {
    "Yes, that works. How does this translate to vessel size?":
      "Quick calculation:\n\nTotal liquid = 2,800 BPD = 19.5 bbl/hr\nLiquid volume needed = 19.5 bbl/hr × (4 min / 60) = 1.3 barrels\n\nFor horizontal vessels like this, liquid typically fills about 50% - gives you the vapor space and surge capacity you need. So:\n\nTotal vessel volume = 1.3 / 0.5 = 2.6 barrels ≈ 2 ft diameter × 6 ft long\n\nBut here's the thing - in pre-FEED you always round to standard sizes. So 3 ft × 10 ft is what I'd recommend.",
    "how does this translate to vessel size":
      "Quick calculation:\n\nTotal liquid = 2,800 BPD = 19.5 bbl/hr\nLiquid volume needed = 19.5 bbl/hr × (4 min / 60) = 1.3 barrels\n\nFor horizontal vessels like this, liquid typically fills about 50% - gives you the vapor space and surge capacity you need. So:\n\nTotal vessel volume = 1.3 / 0.5 = 2.6 barrels ≈ 2 ft diameter × 6 ft long\n\nBut here's the thing - in pre-FEED you always round to standard sizes. So 3 ft × 10 ft is what I'd recommend.",
    "That's 170% margin though. Won't the client push back on that?":
      "Not usually. Here's what happened on similar projects:\n\nThe BP project started with 40% water cut and hit 65% within two years - pretty typical for mature wells. The extra capacity saved a costly field modification.\n\nPlus, 3 ft × 10 ft is a standard vessel size. Custom 2.5 ft × 7 ft actually costs more because it's non-standard fabrication.\n\nPre-FEED margins typically run 50-100%. Clients expect this - they'd rather oversize now than pay for revisions in detailed design.",
    "won't the client push back":
      "Not usually. Here's what happened on similar projects:\n\nThe BP project started with 40% water cut and hit 65% within two years - pretty typical for mature wells. The extra capacity saved a costly field modification.\n\nPlus, 3 ft × 10 ft is a standard vessel size. Custom 2.5 ft × 7 ft actually costs more because it's non-standard fabrication.\n\nPre-FEED margins typically run 50-100%. Clients expect this - they'd rather oversize now than pay for revisions in detailed design.",
    "that's a lot of margin":
      "Not usually. Here's what happened on similar projects:\n\nThe BP project started with 40% water cut and hit 65% within two years - pretty typical for mature wells. The extra capacity saved a costly field modification.\n\nPlus, 3 ft × 10 ft is a standard vessel size. Custom 2.5 ft × 7 ft actually costs more because it's non-standard fabrication.\n\nPre-FEED margins typically run 50-100%. Clients expect this - they'd rather oversize now than pay for revisions in detailed design.",
  },
  3: {
    "I'm noticing some smaller lines around the control valves. What are those for?":
      "Great catch! You're looking at the bypass lines that I can see running parallel to each control valve on your P&ID. That's good design.\n\nDuring valve maintenance, you close the isolation valves and open the manual bypass to keep the separator running - can't afford downtime in the field.\n\nBypass lines are one size smaller than the control valve:\n\n• 6\" control valve → 4\" bypass\n• 4\" control valve → 3\" bypass\n• 3\" control valve → 2\" bypass\n\nThere's a good reason for this. When bypass lines are the same size as control valves, operators run on bypass indefinitely instead of fixing the valve. Making them smaller creates enough back pressure that they're forced to do proper maintenance.",
    "what are those smaller lines":
      "Great catch! You're looking at the bypass lines that I can see running parallel to each control valve on your P&ID. That's good design.\n\nDuring valve maintenance, you close the isolation valves and open the manual bypass to keep the separator running - can't afford downtime in the field.\n\nBypass lines are one size smaller than the control valve:\n\n• 6\" control valve → 4\" bypass\n• 4\" control valve → 3\" bypass\n• 3\" control valve → 2\" bypass\n\nThere's a good reason for this. When bypass lines are the same size as control valves, operators run on bypass indefinitely instead of fixing the valve. Making them smaller creates enough back pressure that they're forced to do proper maintenance.",
    "what are those for":
      "Great catch! You're looking at the bypass lines that I can see running parallel to each control valve on your P&ID. That's good design.\n\nDuring valve maintenance, you close the isolation valves and open the manual bypass to keep the separator running - can't afford downtime in the field.\n\nBypass lines are one size smaller than the control valve:\n\n• 6\" control valve → 4\" bypass\n• 4\" control valve → 3\" bypass\n• 3\" control valve → 2\" bypass\n\nThere's a good reason for this. When bypass lines are the same size as control valves, operators run on bypass indefinitely instead of fixing the valve. Making them smaller creates enough back pressure that they're forced to do proper maintenance.",
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
