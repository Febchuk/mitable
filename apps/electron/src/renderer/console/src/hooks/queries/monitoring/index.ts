/**
 * Monitoring Query Hooks
 *
 * React Query hooks for session monitoring functionality.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "../../../context/UserContext";
import * as monitoringService from "../../../services/monitoringService";

// Query Keys
export const monitoringKeys = {
  all: ["monitoring"] as const,
  sessions: (page?: number) =>
    [...monitoringKeys.all, "sessions", ...(page != null ? [page] : [])] as const,
  session: (id: string) => [...monitoringKeys.all, "sessions", id] as const,
  captures: (sessionId: string) => [...monitoringKeys.session(sessionId), "captures"] as const,
  summary: (sessionId: string) => [...monitoringKeys.session(sessionId), "summary"] as const,
  story: (sessionId: string) => [...monitoringKeys.session(sessionId), "story"] as const,
  slackChannels: () => [...monitoringKeys.all, "slackChannels"] as const,
  slackUsers: () => [...monitoringKeys.all, "slackUsers"] as const,
  recaps: () => [...monitoringKeys.all, "recaps"] as const,
  recap: (id: string) => [...monitoringKeys.recaps(), id] as const,
};

/**
 * Fetch a single page of sessions for the current user.
 */
export function useSessions(page = 1) {
  const { user } = useUser();

  return useQuery({
    queryKey: monitoringKeys.sessions(page),
    queryFn: async () => {
      const response = await monitoringService.fetchSessions(page, 20);
      return {
        sessions: response.sessions,
        pagination: response.pagination,
      };
    },
    enabled: !!user,
    placeholderData: (prev) => prev,
  });
}

/**
 * Fetch a single session by ID
 * @param sessionId - The session ID to fetch
 * @param options.pollWhileSummarizing - If true, poll every 2s while status is "summarizing"
 */
export function useSession(sessionId: string, options?: { pollWhileSummarizing?: boolean }) {
  const { user } = useUser();

  return useQuery({
    queryKey: monitoringKeys.session(sessionId),
    queryFn: async () => {
      const response = await monitoringService.fetchSession(sessionId);
      return {
        ...response.session,
        topKFrames: response.topKFrames,
      };
    },
    enabled: !!user && !!sessionId,
    // Poll to detect status transitions:
    //   active/paused → 5s  (detect external session end from pill)
    //   summarizing   → 2s  (wait for summary + title)
    //   ready/other   → stop
    refetchInterval: options?.pollWhileSummarizing
      ? (query) => {
          const data = query.state.data;
          if (!data) return false;
          const status = data.status;
          if (status === "summarizing") return 2000;
          if (status === "active" || status === "paused") return 5000;
          return false;
        }
      : false,
  });
}

/**
 * Fetch captures for a session
 * @param sessionId - The session ID to fetch captures for
 * @param sessionStatus - Current session status (for conditional polling)
 */
export function useSessionCaptures(sessionId: string, sessionStatus?: string) {
  return useQuery({
    queryKey: monitoringKeys.captures(sessionId),
    queryFn: async () => {
      const response = await monitoringService.fetchSessionCaptures(sessionId);
      return response.captures;
    },
    enabled: !!sessionId,
    // Poll every 5 seconds while session is active or paused (same as useSessionStory)
    refetchInterval: sessionStatus === "active" || sessionStatus === "paused" ? 5000 : false,
  });
}

/**
 * Fetch summary for a session
 * @param sessionId - The session ID to fetch summary for
 * @param sessionStatus - Current session status (for conditional polling)
 */
export function useSessionSummary(sessionId: string, sessionStatus?: string) {
  return useQuery({
    queryKey: monitoringKeys.summary(sessionId),
    queryFn: () => monitoringService.fetchSessionSummary(sessionId),
    enabled: !!sessionId,
    // Poll every 2 seconds while session is being summarized
    refetchInterval: sessionStatus === "summarizing" ? 2000 : false,
  });
}

/**
 * Fetch the progressive master story for a session
 * @param sessionId - The session ID to fetch story for
 * @param sessionStatus - Current session status (for conditional polling)
 */
export function useSessionStory(sessionId: string, sessionStatus?: string) {
  return useQuery({
    queryKey: monitoringKeys.story(sessionId),
    queryFn: () => monitoringService.fetchSessionStory(sessionId),
    enabled: !!sessionId,
    // Poll every 5 seconds while session is active or paused
    refetchInterval: sessionStatus === "active" || sessionStatus === "paused" ? 5000 : false,
  });
}

/**
 * Fetch available Slack channels
 */
export function useSlackChannels() {
  return useQuery({
    queryKey: monitoringKeys.slackChannels(),
    queryFn: monitoringService.fetchSlackChannels,
  });
}

/**
 * Fetch available Slack users for direct messages
 */
export function useSlackUsers() {
  return useQuery({
    queryKey: monitoringKeys.slackUsers(),
    queryFn: monitoringService.fetchSlackUsers,
  });
}

/**
 * End a session mutation
 */
export function useEndSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      sessionId: string;
      preferences?: {
        style: "verbose" | "concise";
        format: "bullets" | "paragraphs";
        includeScreenshots: boolean;
      };
    }) => monitoringService.endSession(params.sessionId, params.preferences),
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });
      queryClient.invalidateQueries({ queryKey: monitoringKeys.session(params.sessionId) });
    },
  });
}

/**
 * Update summary mutation
 */
export function useUpdateSummary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, summary }: { sessionId: string; summary: string }) =>
      monitoringService.updateSessionSummary(sessionId, summary),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: monitoringKeys.summary(sessionId) });
      queryClient.invalidateQueries({ queryKey: monitoringKeys.session(sessionId) });
    },
  });
}

/**
 * Deliver summary to multiple Slack channels, DMs, or email addresses
 */
export function useDeliverSummary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      targets,
      channel = "slack",
    }: {
      sessionId: string;
      targets: Array<{
        type: "channel" | "dm" | "email";
        id: string;
        name?: string;
        email?: string;
      }>;
      channel?: "slack" | "email";
    }) => monitoringService.deliverSummary(sessionId, targets, channel),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: monitoringKeys.session(sessionId) });
      queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });
    },
  });
}

/**
 * Delete session mutation
 */
export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => monitoringService.deleteSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });
    },
  });
}

/**
 * Update session mutation (pause/resume)
 */
export function useUpdateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, action }: { sessionId: string; action: "pause" | "resume" }) =>
      monitoringService.updateSession(sessionId, { action }),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: monitoringKeys.session(sessionId) });
      queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });
    },
  });
}

/**
 * Revise summary with AI assistance
 */
export function useReviseSummary() {
  return useMutation({
    mutationFn: ({
      sessionId,
      instruction,
      currentSummary,
    }: {
      sessionId: string;
      instruction: string;
      currentSummary: string;
    }) => monitoringService.reviseSummary(sessionId, instruction, currentSummary),
  });
}

/**
 * Trigger intermediate summary generation mutation
 */
export function useTriggerIntermediateSummary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => monitoringService.triggerIntermediateSummary(sessionId),
    onSuccess: (_, sessionId) => {
      // Invalidate story query to show new summary in MonitoringView
      queryClient.invalidateQueries({ queryKey: monitoringKeys.story(sessionId) });
      // Invalidate the session detail to update the block specifically
      queryClient.invalidateQueries({ queryKey: monitoringKeys.session(sessionId) });
      // Invalidate the calendar days to ensure the whole calendar refreshes
      queryClient.invalidateQueries({ queryKey: ["calendar", "days"] });
    },
  });
}

/**
 * Update session settings mutation
 */
export function useUpdateSessionSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      settings,
    }: {
      sessionId: string;
      settings: {
        intermediateSummaryIntervalMs?: number;
        intermediateSummaryEnabled?: boolean;
      };
    }) => monitoringService.updateSessionSettings(sessionId, settings),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: monitoringKeys.session(sessionId) });
    },
  });
}

// ===========================
// Recap CRUD Hooks
// ===========================

/**
 * Fetch all recaps for the current user
 */
export function useRecapsList() {
  const { user } = useUser();

  return useQuery({
    queryKey: monitoringKeys.recaps(),
    queryFn: async () => {
      const response = await monitoringService.fetchRecaps();
      return response.recaps;
    },
    enabled: !!user,
  });
}

/**
 * Fetch a single recap by ID
 */
export function useRecapQuery(id: string | undefined) {
  const { user } = useUser();

  return useQuery({
    queryKey: monitoringKeys.recap(id ?? ""),
    queryFn: async () => {
      const response = await monitoringService.fetchRecap(id!);
      return response.recap;
    },
    enabled: !!user && !!id,
  });
}

/**
 * Create a new recap
 */
export function useCreateRecap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      title: string;
      content: string;
      blocks: unknown[];
      totalDuration: number;
    }) => monitoringService.createRecap(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: monitoringKeys.recaps() });
    },
  });
}

/**
 * Update an existing recap
 */
export function useUpdateRecap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { title?: string; content?: string; blocks?: unknown[]; totalDuration?: number };
    }) => monitoringService.updateRecapApi(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: monitoringKeys.recap(id) });
      queryClient.invalidateQueries({ queryKey: monitoringKeys.recaps() });
    },
  });
}

/**
 * Add a delivery to a recap
 */
export function useAddRecapDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, destination }: { id: string; destination: string }) =>
      monitoringService.addRecapDelivery(id, destination),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: monitoringKeys.recap(id) });
      queryClient.invalidateQueries({ queryKey: monitoringKeys.recaps() });
    },
  });
}

/**
 * Delete a recap
 */
export function useDeleteRecap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => monitoringService.deleteRecapApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: monitoringKeys.recaps() });
    },
  });
}

/**
 * Generate a day summary from block summaries (Groq)
 */
export function useGenerateDaySummary() {
  return useMutation({
    mutationFn: (params: { date?: string; sessionIds?: string[] }) =>
      monitoringService.generateDaySummary(params),
  });
}

/**
 * Generate a recap from multiple sessions
 */
export function useGenerateRecap() {
  return useMutation({
    mutationFn: ({
      sessionIds,
      tone,
      length,
    }: {
      sessionIds: string[];
      tone?: string;
      length?: string;
    }) => monitoringService.generateRecap(sessionIds, tone, length),
  });
}

/**
 * Revise recap content with AI
 */
export function useReviseRecap() {
  return useMutation({
    mutationFn: ({
      instruction,
      currentContent,
    }: {
      instruction: string;
      currentContent: string;
    }) => monitoringService.reviseRecap(instruction, currentContent),
  });
}
