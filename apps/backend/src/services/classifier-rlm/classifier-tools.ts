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
 * Tool 4: Interpret Visual Changes (Batch Mode)
 * Analyzes visual changes across screenshots chronologically, scoped per windowId
 */
export const INTERPRET_VISUAL_CHANGES: RLMTool = {
  name: "interpret_visual_changes",
  description:
    "Analyze what changed visually across screenshots in chronological order, grouped by windowId. Returns a narrative of visual changes per window.",
  parameters: [],
  execute: (_params, env) => {
    if (!env.isBatchContext()) {
      return {
        error: "This tool can only be used in batch mode",
      };
    }

    const batchContext = env.getBatchContext();

    // Group captures by windowId
    const capturesByWindow = new Map<string, typeof batchContext.captures>();
    for (const capture of batchContext.captures) {
      const windowId = capture.windowInfo.windowSourceId;
      if (!capturesByWindow.has(windowId)) {
        capturesByWindow.set(windowId, []);
      }
      capturesByWindow.get(windowId)!.push(capture);
    }

    // Analyze visual changes per window chronologically
    const visualInterpretations: Array<{
      windowId: string;
      windowInfo: { appName: string; windowTitle: string };
      changes: Array<{
        sequenceNumber: number;
        timestampISO: string;
        deltaDescription: string;
        deltaChanged: boolean;
        timeSincePrevious?: number; // milliseconds
      }>;
      summary: string;
    }> = [];

    for (const [windowId, captures] of capturesByWindow.entries()) {
      // Sort by sequence number (chronological)
      const sortedCaptures = [...captures].sort(
        (a, b) => a.sequenceNumber - b.sequenceNumber
      );

      const changes = sortedCaptures.map((capture, index) => {
        const previousCapture = index > 0 ? sortedCaptures[index - 1] : null;
        const timeSincePrevious = previousCapture
          ? capture.capturedAt - previousCapture.capturedAt
          : undefined;

        return {
          sequenceNumber: capture.sequenceNumber,
          timestampISO: capture.timestampISO,
          deltaDescription: capture.deltaDescription || "No visual change detected",
          deltaChanged: capture.deltaChanged ?? false,
          timeSincePrevious,
        };
      });

      // Generate summary narrative for this window
      const meaningfulChanges = changes.filter((c) => c.deltaChanged);
      let summary = "";
      if (meaningfulChanges.length === 0) {
        summary = `No visual changes detected in ${captures[0].windowInfo.appName} during this batch window.`;
      } else if (meaningfulChanges.length === 1) {
        summary = `Single visual change: ${meaningfulChanges[0].deltaDescription}`;
      } else {
        const changeDescriptions = meaningfulChanges
          .map((c) => c.deltaDescription)
          .join(" → ");
        summary = `Progression: ${changeDescriptions}`;
      }

      visualInterpretations.push({
        windowId,
        windowInfo: captures[0].windowInfo,
        changes,
        summary,
      });
    }

    return {
      visualInterpretations,
      totalWindows: visualInterpretations.length,
      totalCaptures: batchContext.captures.length,
      reasoning: `Analyzed ${batchContext.captures.length} screenshots across ${visualInterpretations.length} windows, identifying visual changes chronologically per window.`,
    };
  },
};

/**
 * Tool 5: Analyze Screenshot Relationships (Batch Mode)
 * Analyzes relationships between screenshots from different windows
 */
export const ANALYZE_SCREENSHOT_RELATIONSHIPS: RLMTool = {
  name: "analyze_screenshot_relationships",
  description:
    "Analyze the relationships between screenshots from different windows. Understand how windows work together to achieve a single goal.",
  parameters: [],
  execute: (_params, env) => {
    if (!env.isBatchContext()) {
      return {
        error: "This tool can only be used in batch mode",
      };
    }

    const batchContext = env.getBatchContext();

    // Group captures by windowId
    const capturesByWindow = new Map<string, typeof batchContext.captures>();
    for (const capture of batchContext.captures) {
      const windowId = capture.windowInfo.windowSourceId;
      if (!capturesByWindow.has(windowId)) {
        capturesByWindow.set(windowId, []);
      }
      capturesByWindow.get(windowId)!.push(capture);
    }

    if (capturesByWindow.size < 2) {
      return {
        relationships: [],
        summary: "Only one window captured - no relationships to analyze",
        reasoning: "Relationship analysis requires 2+ windows. Only one window was captured in this batch.",
      };
    }

    // Analyze temporal relationships between windows
    const windowIds = Array.from(capturesByWindow.keys());
    const relationships: Array<{
      window1: { windowId: string; appName: string; windowTitle: string };
      window2: { windowId: string; appName: string; windowTitle: string };
      relationship: string;
      evidence: string;
    }> = [];

    // Compare each pair of windows
    for (let i = 0; i < windowIds.length; i++) {
      for (let j = i + 1; j < windowIds.length; j++) {
        const window1Id = windowIds[i];
        const window2Id = windowIds[j];
        const window1Captures = capturesByWindow.get(window1Id)!;
        const window2Captures = capturesByWindow.get(window2Id)!;

        const window1 = window1Captures[0].windowInfo;
        const window2 = window2Captures[0].windowInfo;

        // Analyze temporal patterns
        const window1Changes = window1Captures.filter((c) => c.deltaChanged);
        const window2Changes = window2Captures.filter((c) => c.deltaChanged);

        // Determine relationship based on timing and changes
        let relationship = "";
        let evidence = "";

        if (window1Changes.length > 0 && window2Changes.length > 0) {
          // Both windows had changes - could be complementary or sequential
          const window1FirstChange = window1Changes[0].capturedAt;
          const window2FirstChange = window2Changes[0].capturedAt;
          const timeDiff = Math.abs(window1FirstChange - window2FirstChange);

          if (timeDiff < 5000) {
            // Changes within 5 seconds - likely complementary
            relationship = "Complementary: Both windows used simultaneously for related tasks";
            evidence = `Both ${window1.appName} and ${window2.appName} had changes within ${Math.round(timeDiff / 1000)} seconds`;
          } else {
            // Changes further apart - likely sequential
            if (window1FirstChange < window2FirstChange) {
              relationship = `Sequential: ${window1.appName} changes preceded ${window2.appName} changes`;
              evidence = `${window1.appName} changed first, then ${window2.appName} ${Math.round((window2FirstChange - window1FirstChange) / 1000)} seconds later`;
            } else {
              relationship = `Sequential: ${window2.appName} changes preceded ${window1.appName} changes`;
              evidence = `${window2.appName} changed first, then ${window1.appName} ${Math.round((window1FirstChange - window2FirstChange) / 1000)} seconds later`;
            }
          }
        } else if (window1Changes.length > 0 && window2Changes.length === 0) {
          relationship = `Primary/Reference: ${window1.appName} was actively used while ${window2.appName} was reference/viewing`;
          evidence = `${window1.appName} had ${window1Changes.length} visual changes, ${window2.appName} had none`;
        } else if (window2Changes.length > 0 && window1Changes.length === 0) {
          relationship = `Primary/Reference: ${window2.appName} was actively used while ${window1.appName} was reference/viewing`;
          evidence = `${window2.appName} had ${window2Changes.length} visual changes, ${window1.appName} had none`;
        } else {
          relationship = "Both windows were viewing/reference - no active changes";
          evidence = "Neither window had visual changes during this batch";
        }

        relationships.push({
          window1: { windowId: window1Id, appName: window1.appName, windowTitle: window1.windowTitle },
          window2: { windowId: window2Id, appName: window2.appName, windowTitle: window2.windowTitle },
          relationship,
          evidence,
        });
      }
    }

    return {
      relationships,
      totalWindows: capturesByWindow.size,
      reasoning: `Analyzed relationships between ${capturesByWindow.size} windows, identifying ${relationships.length} window pair relationships based on temporal patterns and visual changes.`,
    };
  },
};

/**
 * Tool 6: Determine Batch Role in Session (Batch Mode)
 * Uses visual interpretations, relationships, activity events, and activity timeline to explain the batch's role
 */
export const DETERMINE_BATCH_ROLE_IN_SESSION: RLMTool = {
  name: "determine_batch_role_in_session",
  description:
    "Determine the role this batch plays in the overall session. Uses visual interpretations, screenshot relationships, activity events, and the full activity timeline to explain what this 1-minute batch contributes to the session.",
  parameters: [],
  execute: (_params, env) => {
    if (!env.isBatchContext()) {
      return {
        error: "This tool can only be used in batch mode",
      };
    }

    const batchContext = env.getBatchContext();

    // Get visual interpretations from cache (should be called first)
    const visualInterpretations = env.getCache("visual_interpretations");
    const relationships = env.getCache("screenshot_relationships");

    // Analyze activity events during batch window
    const keyboardEvents = batchContext.activityEvents.filter((e) => e.type === "keyboard").length;
    const pasteEvents = batchContext.activityEvents.filter((e) => e.type === "paste").length;
    const copyEvents = batchContext.activityEvents.filter((e) => e.type === "copy").length;
    const clickEvents = batchContext.activityEvents.filter((e) => e.type === "click").length;
    const scrollEvents = batchContext.activityEvents.filter((e) => e.type === "scroll").length;

    // Determine activity mode from events
    let activityMode = "VIEWING";
    if (keyboardEvents > 50) {
      activityMode = "AUTHORING";
    } else if (pasteEvents > 0) {
      activityMode = "PASTING";
    } else if (keyboardEvents > 5) {
      activityMode = "EDITING";
    } else if (scrollEvents > 10 && keyboardEvents < 5) {
      activityMode = "READING";
    } else if (clickEvents > 0 && keyboardEvents === 0) {
      activityMode = "NAVIGATION";
    }

    // Analyze activity timeline context
    const previousActivities = batchContext.activityTimeline.slice(-5); // Last 5 activities
    const previousActivitySummary = previousActivities
      .map((a) => a.activityDescription)
      .join(" → ");

    // Build role analysis
    const batchDurationSeconds = (batchContext.batchEndTime - batchContext.batchStartTime) / 1000;
    const windowCount = new Set(batchContext.captures.map((c) => c.windowInfo.windowSourceId)).size;

    let roleDescription = "";
    let roleReasoning = "";

    // Determine role based on context
    if (previousActivities.length === 0) {
      roleDescription = "Session initialization: First batch of activity";
      roleReasoning = "No previous activities in timeline - this is the start of the session";
    } else if (visualInterpretations && relationships) {
      const hasActiveChanges = batchContext.captures.some((c) => c.deltaChanged);
      if (hasActiveChanges) {
        roleDescription = `Active work period: ${activityMode.toLowerCase()} activity across ${windowCount} window(s)`;
        roleReasoning = `User was ${activityMode.toLowerCase()} (${keyboardEvents} keyboard events, ${pasteEvents} pastes) while using ${windowCount} window(s). Previous context: ${previousActivitySummary}`;
      } else {
        roleDescription = "Review/planning period: No active changes, likely reviewing or planning";
        roleReasoning = `No visual changes detected despite ${batchContext.activityEvents.length} activity events. User may be reviewing content or planning next steps. Previous context: ${previousActivitySummary}`;
      }
    } else {
      roleDescription = `Activity period: ${activityMode.toLowerCase()} mode with ${windowCount} window(s)`;
      roleReasoning = `Batch shows ${activityMode.toLowerCase()} activity. Call interpret_visual_changes and analyze_screenshot_relationships first for detailed analysis.`;
    }

    return {
      roleDescription,
      roleReasoning,
      activityMode,
      batchDurationSeconds: Math.round(batchDurationSeconds),
      windowCount,
      activityEventCounts: {
        keyboard: keyboardEvents,
        paste: pasteEvents,
        copy: copyEvents,
        click: clickEvents,
        scroll: scrollEvents,
      },
      previousActivityContext: previousActivitySummary || "No previous activities",
      sessionGoal: batchContext.sessionGoal,
      reasoning: `Analyzed batch role using visual changes, window relationships, ${batchContext.activityEvents.length} activity events, and ${batchContext.activityTimeline.length} previous activities in timeline.`,
    };
  },
};

/**
 * All available Classifier tools
 */
export const CLASSIFIER_TOOLS: RLMTool[] = [
  GET_CONTEXT,
  ANALYZE_EVIDENCE,
  VERIFY_CLASSIFICATION,
  INTERPRET_VISUAL_CHANGES,
  ANALYZE_SCREENSHOT_RELATIONSHIPS,
  DETERMINE_BATCH_ROLE_IN_SESSION,
];

/**
 * Get tool by name
 */
export function getToolByName(name: string): RLMTool | undefined {
  return CLASSIFIER_TOOLS.find((tool) => tool.name === name);
}
