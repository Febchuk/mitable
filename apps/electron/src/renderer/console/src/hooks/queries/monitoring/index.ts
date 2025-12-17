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
  sessions: () => [...monitoringKeys.all, "sessions"] as const,
  session: (id: string) => [...monitoringKeys.sessions(), id] as const,
  captures: (sessionId: string) => [...monitoringKeys.session(sessionId), "captures"] as const,
  summary: (sessionId: string) => [...monitoringKeys.session(sessionId), "summary"] as const,
  slackChannels: () => [...monitoringKeys.all, "slackChannels"] as const,
  slackUsers: () => [...monitoringKeys.all, "slackUsers"] as const,
};

/**
 * Fetch all sessions for the current user
 */
export function useSessions() {
  const { user } = useUser();

  return useQuery({
    queryKey: monitoringKeys.sessions(),
    queryFn: async () => {
      const response = await monitoringService.fetchSessions();
      return response.sessions;
    },
    enabled: !!user,
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
      return response.session;
    },
    enabled: !!user && !!sessionId,
    // Poll every 2 seconds while session is being summarized
    refetchInterval: options?.pollWhileSummarizing
      ? (query) => (query.state.data?.status === "summarizing" ? 2000 : false)
      : false,
  });
}

/**
 * Fetch captures for a session
 */
export function useSessionCaptures(sessionId: string) {
  return useQuery({
    queryKey: monitoringKeys.captures(sessionId),
    queryFn: async () => {
      const response = await monitoringService.fetchSessionCaptures(sessionId);
      return response.captures;
    },
    enabled: !!sessionId,
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
    mutationFn: (sessionId: string) => monitoringService.endSession(sessionId),
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });
      queryClient.invalidateQueries({ queryKey: monitoringKeys.session(sessionId) });
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
 * Deliver summary to multiple Slack channels and/or DMs
 */
export function useDeliverSummary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      targets,
    }: {
      sessionId: string;
      targets: Array<{ type: "channel" | "dm"; id: string; name?: string }>;
    }) => monitoringService.deliverSummary(sessionId, targets),
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
