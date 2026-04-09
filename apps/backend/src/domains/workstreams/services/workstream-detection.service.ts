/**
 * Workstream Detection Service
 *
 * Detects workstream names from capture context using heuristics.
 * Mirrors frontend logic for consistency.
 */

import type { WorkstreamAssignment } from "@mitable/shared";

// Configuration for workstream detection
const CONFIG = {
  communicationApps: ["slack", "teams", "mail", "outlook", "messages", "discord"],
  meetingApps: ["zoom", "meet", "webex", "facetime"],
  deepWorkApps: ["code", "vscode", "intellij", "webstorm", "terminal", "iterm", "figma", "xd"],
};

interface CaptureContext {
  appName: string | null;
  windowTitle: string | null;
  linearIssueId?: string | null;
  linearIssueTitle?: string | null;
}

/**
 * Workstream Detection Service
 */
class WorkstreamDetectionService {
  /**
   * Detect workstream from capture context
   */
  detectWorkstream(context: CaptureContext): WorkstreamAssignment {
    const title = context.windowTitle?.toLowerCase() || "";
    const app = context.appName?.toLowerCase() || "";

    // 1. Linear issue context (highest priority if available)
    if (context.linearIssueId && context.linearIssueTitle) {
      return {
        name: context.linearIssueTitle,
        normalizedName: this.normalizeName(context.linearIssueTitle),
        source: "linear_issue",
        confidence: 0.95,
      };
    }

    // 2. Project folder detection (VS Code, terminal, etc.)
    // Match patterns like "[project-name]" in title
    const bracketMatch = title.match(/\[([^\]]+)\]/);
    if (bracketMatch && bracketMatch[1].length > 2) {
      return {
        name: bracketMatch[1],
        normalizedName: this.normalizeName(bracketMatch[1]),
        source: "window_title",
        confidence: 0.85,
      };
    }

    // 3. File path detection - extract parent folder
    // Match patterns like "folder/file.ts" or "folder\file.ts"
    const pathMatch = title.match(/([^/\\]+)[/\\][^/\\]+\.\w+$/);
    if (pathMatch && pathMatch[1].length > 2 && !pathMatch[1].includes(" ")) {
      return {
        name: pathMatch[1],
        normalizedName: this.normalizeName(pathMatch[1]),
        source: "file_path",
        confidence: 0.75,
      };
    }

    // 4. Git branch detection in terminal
    const gitMatch = title.match(/\(([a-z0-9-_/]+)\)/i);
    if (gitMatch && (gitMatch[1].includes("/") || gitMatch[1].includes("-"))) {
      const branchName = gitMatch[1].split("/").pop() || gitMatch[1];
      return {
        name: branchName,
        normalizedName: this.normalizeName(branchName),
        source: "git_branch",
        confidence: 0.8,
      };
    }

    // 5. Communication apps → "Communications"
    if (CONFIG.communicationApps.some((c) => app.includes(c))) {
      return {
        name: "Communications",
        normalizedName: "Communications",
        source: "app_category",
        confidence: 0.9,
      };
    }

    // 6. Meeting apps → "Meetings"
    if (CONFIG.meetingApps.some((m) => app.includes(m) || title.includes(m))) {
      return {
        name: "Meetings",
        normalizedName: "Meetings",
        source: "app_category",
        confidence: 0.9,
      };
    }

    // 7. Design tool with file name
    if (app.includes("figma") || app.includes("sketch")) {
      const figmaMatch = title.match(/^([^–-]+)/);
      if (figmaMatch && figmaMatch[1].trim().length > 2) {
        return {
          name: figmaMatch[1].trim(),
          normalizedName: this.normalizeName(figmaMatch[1].trim()),
          source: "window_title",
          confidence: 0.7,
        };
      }
    }

    // 8. Default: use app name as workstream
    const appName = context.appName || "Unknown";
    return {
      name: appName,
      normalizedName: this.normalizeName(appName),
      source: "app_name",
      confidence: 0.5,
    };
  }

  /**
   * Normalize workstream name for consistency
   */
  normalizeName(name: string): string {
    return name
      .split(/[-_\s]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ")
      .trim();
  }

  /**
   * Check if an app is a "deep work" app (coding, design, etc.)
   */
  isDeepWorkApp(appName: string | null): boolean {
    if (!appName) return false;
    const app = appName.toLowerCase();
    return CONFIG.deepWorkApps.some((d) => app.includes(d));
  }

  /**
   * Check if workstream is an interruption (communication/meeting)
   */
  isInterruption(workstreamName: string): boolean {
    const normalized = workstreamName.toLowerCase();
    return normalized === "communications" || normalized === "meetings";
  }
}

export const workstreamDetectionService = new WorkstreamDetectionService();
