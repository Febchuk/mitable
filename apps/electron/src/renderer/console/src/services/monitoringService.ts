/**
 * Monitoring Service
 *
 * API client for session monitoring functionality.
 */

import { apiRequest } from "./api";
import type { MonitoringSessionState, SelectedWindowInfo } from "@mitable/shared";

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
export async function fetchSession(sessionId: string): Promise<{ session: MonitoringSession }> {
  return apiRequest<{ session: MonitoringSession }>(`/monitoring/sessions/${sessionId}`);
}

/**
 * Create a new monitoring session (backend only - Electron handles capture)
 */
export async function createSession(data: CreateSessionRequest): Promise<{ session: MonitoringSession }> {
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
  data: { status?: string; name?: string }
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
export async function fetchSessionCaptures(sessionId: string): Promise<{ captures: SessionCapture[] }> {
  return apiRequest<{ captures: SessionCapture[] }>(`/monitoring/sessions/${sessionId}/captures`);
}

/**
 * Fetch summary for a session
 */
export async function fetchSessionSummary(sessionId: string): Promise<SessionSummary> {
  return apiRequest<SessionSummary>(`/monitoring/sessions/${sessionId}/summary`);
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

/**
 * Deliver summary to Slack
 */
export async function deliverSummary(
  sessionId: string,
  target: { channelId: string; channelName?: string }
): Promise<{
  success: boolean;
  deliveryStatus: string;
  messageTs?: string;
  deliveredAt: string;
}> {
  return apiRequest(`/monitoring/sessions/${sessionId}/deliver`, {
    method: "POST",
    body: JSON.stringify({
      channel: "slack",
      target,
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
