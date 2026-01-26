/**
 * Classifier RLM Tools
 *
 * Three focused tools that provide INTERPRETATIONS, not raw data.
 * Each tool does the hard deterministic reasoning so the LLM can focus on integration.
 */

import { ClassifierEnvironment } from "./classifier-environment";

export interface RLMToolParameter {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
}

export interface RLMTool {
  name: string;
  description: string;
  parameters: RLMToolParameter[];
  execute: (params: any, env: ClassifierEnvironment) => Promise<any> | any;
}

/**
 * Tool 1: Get Context
 * Returns STRICT N-1 + N + interval evidence (no unbounded history)
 */
export const GET_CONTEXT: RLMTool = {
  name: "get_context",
  description:
    "Get context for frame N: previous frame (N-1), current frame (N), and interval evidence between them",
  parameters: [],
  execute: (_params, env: ClassifierEnvironment) => {
    const context = env.getContext();

    // N-1 (previous frame)
    const prevFrame =
      context.previousDeltas && context.previousDeltas.length > 0
        ? context.previousDeltas[context.previousDeltas.length - 1]
        : null;

    // Last classification (if available) - helps with continuation detection
    const prevClassification =
      context.recentHistory && context.recentHistory.length > 0
        ? context.recentHistory[context.recentHistory.length - 1]
        : null;

    return {
      prev: prevFrame
        ? {
            delta: prevFrame.description,
            classification: prevClassification,
            timestamp: prevFrame.timestamp,
          }
        : null,
      curr: {
        delta: context.currentDelta,
        window: context.windowInfo || { app: "Unknown", title: "Unknown" },
        timestamp: new Date().toISOString(),
      },
      interval: {
        dt_seconds: context.timeElapsed || 0,
        temporal_pattern: context.timeElapsed
          ? context.timeElapsed < 15
            ? "Quick transition - likely navigation or opening"
            : context.timeElapsed > 30
              ? "Extended time - likely reading, reviewing, or thinking"
              : "Normal workflow pace"
          : "Unknown timing",
      },
      sequential_logic: prevFrame
        ? `Previous: "${prevFrame.description}" → Current: "${context.currentDelta}"`
        : "First frame - no previous context",
      user_role: context.userPersona?.jobTitle || "Knowledge Worker",
    };
  },
};

/**
 * Tool 2: Analyze Evidence
 * Returns INTERPRETED evidence with claims_allowed flags
 * This does the deterministic reasoning so LLM doesn't have to
 */
export const ANALYZE_EVIDENCE: RLMTool = {
  name: "analyze_evidence",
  description:
    "Analyze activity evidence and return what claims are allowed based on keyboard/clipboard/mouse counts",
  parameters: [],
  execute: (_params, env: ClassifierEnvironment) => {
    const evidence = env.getEvidence();

    if (!evidence) {
      return {
        available: false,
        mode: "VIEWING",
        claims_allowed: {
          canClaimTyped: false,
          canClaimPasted: false,
          canClaimAuthored: false,
          canClaimMessaged: false,
          canClaimEdited: false,
        },
        interpretation: "No activity evidence available - classify based on visual delta only",
      };
    }

    // Deterministic claims based on evidence
    const canClaimTyped = evidence.keyboardEventCount > 5;
    const canClaimPasted = evidence.pasteCount > 0;
    const canClaimAuthored = evidence.keyboardEventCount > 50 && evidence.pasteCount === 0;
    const canClaimMessaged = evidence.keyboardEventCount > 10; // Need typing for messaging
    const canClaimEdited = evidence.keyboardEventCount > 5 || evidence.pasteCount > 0;

    // Determine action mode
    let mode: "VIEWING" | "NAVIGATION" | "PASTING" | "AUTHORING" | "EDITING" | "READING" =
      "VIEWING";

    if (evidence.keyboardEventCount > 50) {
      mode = "AUTHORING";
    } else if (evidence.pasteCount > 0) {
      mode = "PASTING";
    } else if (evidence.keyboardEventCount > 5) {
      mode = "EDITING";
    } else if (evidence.mouseScrollCount > 10 && evidence.keyboardEventCount < 5) {
      mode = "READING";
    } else if (evidence.mouseClickCount > 0 && evidence.keyboardEventCount === 0) {
      mode = "NAVIGATION";
    }

    // Suggested verbs based on mode
    const suggestedVerbs: string[] = [];
    switch (mode) {
      case "VIEWING":
        suggestedVerbs.push("viewed", "opened", "reviewed", "examined");
        break;
      case "READING":
        suggestedVerbs.push("read", "reviewed", "scrolled through", "examined");
        break;
      case "NAVIGATION":
        suggestedVerbs.push("clicked", "opened", "navigated to", "switched to");
        break;
      case "PASTING":
        suggestedVerbs.push("pasted", "inserted", "added content from");
        break;
      case "EDITING":
        suggestedVerbs.push("edited", "modified", "updated", "adjusted");
        break;
      case "AUTHORING":
        suggestedVerbs.push("composed", "wrote", "authored", "created");
        break;
    }

    // Evidence signals for reasoning
    const signals: string[] = [];

    if (evidence.keyboardEventCount === 0) {
      signals.push("0 keyboard events → NO typing occurred");
    } else {
      signals.push(
        `${evidence.keyboardEventCount} keyboard events → ${mode.toLowerCase()} activity`
      );
    }

    if (evidence.pasteCount > 0) {
      signals.push(`${evidence.pasteCount} paste(s) → content NOT authored`);
    }

    if (evidence.mouseClickCount > 0) {
      signals.push(
        `${evidence.mouseClickCount} click(s) → ${mode === "NAVIGATION" ? "navigation" : "interaction"}`
      );
    }

    if (evidence.mouseScrollCount > 10) {
      signals.push(`${evidence.mouseScrollCount} scrolls → reading/reviewing`);
    }

    return {
      mode,
      claims_allowed: {
        canClaimTyped,
        canClaimPasted,
        canClaimAuthored,
        canClaimMessaged,
        canClaimEdited,
      },
      suggested_verbs: suggestedVerbs,
      signals,
      raw_counts: {
        keyboard: evidence.keyboardEventCount,
        clicks: evidence.mouseClickCount,
        scrolls: evidence.mouseScrollCount,
        copy: evidence.copyCount,
        paste: evidence.pasteCount,
        cut: evidence.cutCount,
      },
    };
  },
};

/**
 * Tool 3: Verify Classification
 * Sanity-checks a proposed classification against evidence using claims_allowed
 */
export const VERIFY_CLASSIFICATION: RLMTool = {
  name: "verify_classification",
  description:
    "Verify if a proposed activity classification is consistent with evidence constraints. Returns violations if claims are not allowed.",
  parameters: [
    {
      name: "proposed_activity",
      type: "string",
      description: "The activity description you want to verify",
      required: true,
    },
  ],
  execute: (params, env: ClassifierEnvironment) => {
    const { proposed_activity } = params;
    const evidence = env.getEvidence();

    if (!evidence) {
      return {
        consistent: true,
        confidence: 0.5,
        violations: [],
        rewrite: null,
        alternatives: [],
      };
    }

    // Determine what claims are allowed based on evidence
    const canClaimTyped = evidence.keyboardEventCount > 5;
    const canClaimPasted = evidence.pasteCount > 0;
    const canClaimAuthored = evidence.keyboardEventCount > 50 && evidence.pasteCount === 0;
    const canClaimMessaged = evidence.keyboardEventCount > 10;

    const activity = proposed_activity.toLowerCase();
    const violations: string[] = [];
    let rewrite: string | null = null;

    // Check typing claims
    if (
      (activity.includes("composed") ||
        activity.includes("wrote") ||
        activity.includes("authored") ||
        activity.includes("typed") ||
        activity.includes("creating")) &&
      !canClaimTyped
    ) {
      violations.push(
        `Claims typing/authoring but keyboard count = ${evidence.keyboardEventCount} (need >5)`
      );
      rewrite = activity.includes("message") ? "Viewed message" : "Viewed content";
    }

    // Check paste claims
    if (activity.includes("pasted") && !canClaimPasted) {
      violations.push(`Claims pasting but paste count = 0`);
      rewrite = "Viewed content";
    }

    // Check authoring claims
    if ((activity.includes("authored") || activity.includes("created")) && !canClaimAuthored) {
      if (evidence.pasteCount > 0) {
        violations.push(
          `Claims authoring but paste count = ${evidence.pasteCount} (content was pasted, not authored)`
        );
        rewrite = "Pasted content";
      } else {
        violations.push(
          `Claims authoring but keyboard count = ${evidence.keyboardEventCount} (need >50 for authoring)`
        );
        rewrite = "Edited content";
      }
    }

    // Check messaging/communication claims
    if (
      (activity.includes("exchanged") ||
        activity.includes("discussed") ||
        activity.includes("messaged")) &&
      !canClaimMessaged
    ) {
      violations.push(
        `Claims messaging/communication but keyboard count = ${evidence.keyboardEventCount} (need >10)`
      );
      rewrite =
        activity.includes("chat") || activity.includes("message")
          ? "Viewed chat"
          : "Viewed content";
    }

    // Check plural claims
    if (
      (activity.includes("messages") ||
        activity.includes("several") ||
        activity.includes("multiple")) &&
      evidence.keyboardEventCount < 30
    ) {
      violations.push(
        `Claims plural/multiple items but keyboard count = ${evidence.keyboardEventCount} (insufficient for multiple compositions)`
      );
      rewrite = proposed_activity
        .replace(/messages/g, "message")
        .replace(/several/g, "a")
        .replace(/multiple/g, "a");
    }

    // Check update/modification claims
    if (
      (activity.includes("updated") ||
        activity.includes("modified") ||
        activity.includes("changed")) &&
      evidence.keyboardEventCount < 5 &&
      evidence.pasteCount === 0
    ) {
      violations.push(
        `Claims modification but no evidence of editing (keyboard=${evidence.keyboardEventCount}, paste=0)`
      );
      rewrite = "Viewed " + (activity.includes("dashboard") ? "dashboard" : "page");
    }

    // Return verification result
    if (violations.length > 0) {
      return {
        consistent: false,
        confidence: 0.2,
        violations,
        rewrite,
        alternatives: [
          rewrite || "Viewed content",
          evidence.mouseClickCount > 0 ? "Clicked on element" : "Reviewed information",
          evidence.mouseScrollCount > 10 ? "Scrolled through content" : "Opened page",
        ].filter((alt, idx, arr) => arr.indexOf(alt) === idx), // Remove duplicates
      };
    }

    return {
      consistent: true,
      confidence: 0.9,
      violations: [],
      rewrite: null,
      alternatives: [],
    };
  },
};

/**
 * All available Classifier tools
 */
export const CLASSIFIER_TOOLS: RLMTool[] = [GET_CONTEXT, ANALYZE_EVIDENCE, VERIFY_CLASSIFICATION];

/**
 * Get tool by name
 */
export function getToolByName(name: string): RLMTool | undefined {
  return CLASSIFIER_TOOLS.find((tool) => tool.name === name);
}
