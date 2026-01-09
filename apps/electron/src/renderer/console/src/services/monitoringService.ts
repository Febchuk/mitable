/**
 * Monitoring Service
 *
 * API client for session monitoring functionality.
 */

import { apiRequest } from "./api";
import type { MonitoringSessionState, SelectedWindowInfo } from "@mitable/shared";
import { createLogger } from "../../../lib/logger";

const logger = createLogger("MonitoringService");

// ===========================
// Types
// ===========================

export interface MonitoringSession {
  id: string;
  name: string | null;
  status: "active" | "paused" | "ended" | "summarizing" | "ready" | "delivered";
  captureIntervalMs: number;
  selectedWindows: SelectedWindowInfo[];
  startedAt: string;
  pausedAt: string | null;
  endedAt: string | null;
  totalPausedMs: number;
  rawActivitySummary: string | null;
  finalSummary: string | null;
  keyActivities: unknown[];
  deliveryStatus: string | null;
  deliveryChannel: string | null;
  deliveryTarget: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  captureCount?: number;
}

export interface SessionListItem {
  id: string;
  name: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  captureCount: number;
  duration: {
    totalMs: number;
    activeMs: number;
    pausedMs: number;
    formatted: string;
  };
  deliveryStatus: string | null;
}

export interface CreateSessionRequest {
  selectedWindows: SelectedWindowInfo[];
  captureIntervalMs?: number;
  name?: string;
  // Goal context fields (optional)
  sessionGoal?: string;
  linearIssueId?: string;
  linearIssueTitle?: string;
  linearIssueDescription?: string;
  additionalContext?: string;
}

export interface LinearIssue {
  id: string;
  identifier: string; // e.g., "LIN-341"
  title: string;
  description?: string;
  state: {
    id: string;
    name: string;
    color: string;
  };
  team: {
    id: string;
    name: string;
    key: string;
  };
  url: string;
}

export interface SessionCapture {
  id: string;
  sequenceNumber: number;
  captureTrigger: string;
  capturedAt: string;
  windowId: string | null;
  appName: string | null;
  windowTitle: string | null;
  analysisStatus: string | null;
  activityDescription: string | null;
  confidence: number | null;
  imageData: string | null;
}

export interface TopKFrame {
  id: string;
  sequenceNumber: number;
  capturedAt: string;
  appName: string | null;
  windowTitle: string | null;
  activityDescription: string | null;
  importanceScore: number | null;
  imageData: string | null;
}

export interface SessionSummary {
  summary: {
    id: string;
    version: number;
    summaryType: string;
    narrativeSummary: string;
    activities: unknown[];
    timeBreakdown: unknown;
    modelUsed: string | null;
    tokenCount: number | null;
    createdAt: string;
  } | null;
  rawSummary: string | null;
  finalSummary: string | null;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
  num_members?: number;
}

export interface SlackUser {
  id: string;
  name: string;
  real_name: string;
  display_name: string;
  avatar: string;
  is_bot: boolean;
}

// ===========================
// API Functions
// ===========================

/**
 * Fetch all sessions for the current user
 */
export async function fetchSessions(): Promise<{ sessions: SessionListItem[] }> {
  return apiRequest<{ sessions: SessionListItem[] }>("/monitoring/sessions");
}

/**
 * Fetch a single session by ID
 */
export async function fetchSession(
  sessionId: string
): Promise<{ session: MonitoringSession; topKFrames?: TopKFrame[] }> {
  return apiRequest<{ session: MonitoringSession; topKFrames?: TopKFrame[] }>(
    `/monitoring/sessions/${sessionId}`
  );
}

/**
 * Create a new monitoring session (backend only - Electron handles capture)
 */
export async function createSession(
  data: CreateSessionRequest
): Promise<{ session: MonitoringSession }> {
  return apiRequest<{ session: MonitoringSession }>("/monitoring/sessions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Update session (pause/resume)
 */
export async function updateSession(
  sessionId: string,
  data: { action?: "pause" | "resume"; name?: string }
): Promise<{ session: MonitoringSession }> {
  return apiRequest<{ session: MonitoringSession }>(`/monitoring/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/**
 * End a session and trigger summary generation
 */
export async function endSession(sessionId: string): Promise<{
  success: boolean;
  session: {
    id: string;
    status: string;
    startedAt: string;
    endedAt: string;
    duration: {
      totalMs: number;
      activeMs: number;
      pausedMs: number;
      formatted: string;
    };
    captureCount: number;
  };
}> {
  return apiRequest(`/monitoring/sessions/${sessionId}/end`, {
    method: "POST",
  });
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/monitoring/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

/**
 * Fetch captures for a session
 */
export async function fetchSessionCaptures(
  sessionId: string
): Promise<{ captures: SessionCapture[] }> {
  return apiRequest<{ captures: SessionCapture[] }>(`/monitoring/sessions/${sessionId}/captures`);
}

/**
 * Fetch summary for a session
 */
export async function fetchSessionSummary(sessionId: string): Promise<SessionSummary> {
  return apiRequest<SessionSummary>(`/monitoring/sessions/${sessionId}/summary`);
}

/**
 * Story response type
 */
export interface SessionStory {
  story: string;
  metadata: {
    version: number;
    length: number;
    lastUpdated: string | null;
    totalTokens: number;
  };
}

/**
 * Fetch the progressive master story for a session
 */
export async function fetchSessionStory(sessionId: string): Promise<SessionStory> {
  return apiRequest<SessionStory>(`/monitoring/sessions/${sessionId}/story`);
}

/**
 * Update the summary (user edits)
 */
export async function updateSessionSummary(
  sessionId: string,
  finalSummary: string
): Promise<{ success: boolean; summary: unknown }> {
  return apiRequest(`/monitoring/sessions/${sessionId}/summary`, {
    method: "PATCH",
    body: JSON.stringify({ finalSummary }),
  });
}

export interface DeliveryTarget {
  type: "channel" | "dm" | "email";
  id: string;
  name?: string;
  email?: string;
}

export interface DeliveryResult {
  id: string;
  type: "channel" | "dm" | "email";
  name?: string;
  email?: string;
  status: "delivered" | "failed";
  messageTs?: string;
  error?: string;
}

/**
 * Deliver summary to multiple Slack channels, direct messages, or email addresses
 */
export async function deliverSummary(
  sessionId: string,
  targets: DeliveryTarget[],
  channel: "slack" | "email" = "slack"
): Promise<{
  success: boolean;
  results: DeliveryResult[];
  deliveredAt: string;
}> {
  return apiRequest(`/monitoring/sessions/${sessionId}/deliver`, {
    method: "POST",
    body: JSON.stringify({
      channel,
      targets,
    }),
  });
}

/**
 * Fetch available Slack channels for delivery
 */
export async function fetchSlackChannels(): Promise<SlackChannel[]> {
  const response = await apiRequest<{ channels: SlackChannel[] }>("/integrations/slack/channels");
  return response.channels;
}

/**
 * Fetch available Slack users for direct message delivery
 */
export async function fetchSlackUsers(): Promise<SlackUser[]> {
  const response = await apiRequest<{ users: SlackUser[] }>("/integrations/slack/users");
  return response.users;
}

/**
 * Fetch the user's assigned Linear issues
 * Returns empty array if Linear is not connected
 */
export async function fetchLinearIssues(): Promise<LinearIssue[]> {
  try {
    const response = await apiRequest<{ issues: LinearIssue[] }>("/integrations/linear/issues");
    return response.issues;
  } catch (error) {
    // Return empty array if Linear is not connected or request fails
    logger.warn(" Failed to fetch Linear issues:", error);
    return [];
  }
}

/**
 * Check if user has Linear connected
 */
export async function checkLinearConnection(): Promise<boolean> {
  try {
    const response = await apiRequest<{ isConnected: boolean }>("/integrations/linear/status");
    return response.isConnected;
  } catch {
    return false;
  }
}

/**
 * Start a monitoring session via IPC (Electron main process)
 */
export async function startMonitoringSession(config: {
  sessionId: string; // Backend's session ID - ensures Electron uses same ID
  selectedWindows: SelectedWindowInfo[];
  captureIntervalMs: number;
  name?: string;
  userId: string;
  organizationId: string;
}): Promise<{ sessionId: string; error?: string }> {
  // This calls the Electron IPC handler
  return window.consoleAPI.startMonitoringSession(config);
}

/**
 * Pause the active monitoring session via IPC
 */
export async function pauseMonitoringSession(): Promise<{ success: boolean; error?: string }> {
  return window.consoleAPI.pauseMonitoringSession();
}

/**
 * Resume the paused monitoring session via IPC
 */
export async function resumeMonitoringSession(): Promise<{ success: boolean; error?: string }> {
  return window.consoleAPI.resumeMonitoringSession();
}

/**
 * End the active monitoring session via IPC
 * Returns captures data for upload to backend
 */
export async function endMonitoringSession(): Promise<{
  success: boolean;
  sessionId?: string;
  captureCount?: number;
  captures?: Array<{
    sequenceNumber: number;
    captureTrigger: "periodic" | "focus_change" | "manual";
    capturedAt: number;
    windowId?: string;
    appName?: string;
    windowTitle?: string;
    screenshotPath?: string;
    screenshotHash?: string;
  }>;
  error?: string;
}> {
  return window.consoleAPI.endMonitoringSession();
}

/**
 * Upload captures to backend (call after ending Electron session, before triggering summarization)
 * Includes base64 imageData for backend AI analysis
 */
export async function uploadCaptures(
  sessionId: string,
  captures: Array<{
    sequenceNumber: number;
    captureTrigger: "periodic" | "focus_change" | "manual";
    capturedAt: number;
    windowId?: string;
    appName?: string;
    windowTitle?: string;
    screenshotPath?: string;
    screenshotHash?: string;
    imageData?: string;
  }>
): Promise<{ success: boolean; insertedCount?: number }> {
  return apiRequest(`/monitoring/sessions/${sessionId}/captures`, {
    method: "POST",
    body: JSON.stringify({ captures }),
  });
}

/**
 * Get current session state from Electron
 */
export async function getMonitoringSessionState(): Promise<MonitoringSessionState | null> {
  return window.consoleAPI.getMonitoringSessionState();
}

/**
 * Request AI revision of a session summary
 */
export async function reviseSummary(
  sessionId: string,
  instruction: string,
  currentSummary: string
): Promise<{ suggestion: string }> {
  return apiRequest(`/monitoring/sessions/${sessionId}/summary/revise`, {
    method: "POST",
    body: JSON.stringify({ instruction, currentSummary }),
  });
}

/**
 * Check if user has Gmail connected for email delivery
 */
export async function checkGmailConnection(): Promise<{
  connected: boolean;
  expired: boolean;
  email: string | null;
}> {
  try {
    return await apiRequest<{
      connected: boolean;
      expired: boolean;
      email: string | null;
    }>("/integrations/gmail/status");
  } catch {
    return { connected: false, expired: false, email: null };
  }
}

/**
 * Start Gmail OAuth flow
 */
export async function startGmailOAuth(): Promise<{ authUrl: string }> {
  return apiRequest<{ authUrl: string }>("/integrations/gmail/oauth/start", {
    method: "POST",
  });
}

/**
 * Disconnect Gmail
 */
export async function disconnectGmail(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>("/integrations/gmail/disconnect", {
    method: "DELETE",
  });
}

/**
 * DEV ONLY: Regenerate session summary
 */
export async function regenerateSummary(
  sessionId: string
): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>(
    `/monitoring/sessions/${sessionId}/regenerate-summary`,
    { method: "POST" }
  );
}
