/**
 * useSessionWorkstreams Hook
 *
 * Fetches workstreams from the backend API with fallback to client-side transform.
 * Provides consistent workstream data regardless of the data source.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  fetchSessionWorkstreams,
  type WorkstreamResponse,
} from "@/console/src/services/monitoringService";
import { useSessionCaptures } from "@/console/src/hooks/queries/monitoring";
import { transformToWorkstreams } from "../utils/workstreamTransform";
import type { TransformedWorkstreams, Workstream, WorkstreamColor } from "../utils/types";

/**
 * Convert backend workstream response to frontend format
 */
function convertToFrontendFormat(
  response: WorkstreamResponse,
  captures?: ReturnType<typeof useSessionCaptures>["data"]
): TransformedWorkstreams {
  // Map backend workstreams to frontend format
  const workstreams: Workstream[] = response.workstreams.map((ws) => {
    // Find captures that belong to this workstream (by ID matching)
    const wsCaptures =
      captures?.filter((c) => ws.captureIds?.includes(c.id)) || [];

    return {
      id: ws.id,
      name: ws.name,
      color: ws.color as WorkstreamColor,
      totalDurationMinutes: ws.totalDurationMinutes,
      segments: ws.segments,
      appsUsed: ws.appsUsed,
      captures: wsCaptures,
      dominantActivity: ws.dominantActivity,
    };
  });

  return {
    workstreams,
    sessionStats: response.sessionStats,
    sessionStartTime: response.sessionStartTime,
    sessionEndTime: response.sessionEndTime,
  };
}

interface UseSessionWorkstreamsOptions {
  /** Use backend API (true) or client-side transform (false). Default: true */
  useBackend?: boolean;
  /** Session status for conditional fetching */
  sessionStatus?: string;
}

interface UseSessionWorkstreamsResult {
  data: TransformedWorkstreams | null;
  isLoading: boolean;
  error: Error | null;
  /** Which source provided the data: "backend" | "client" | null */
  dataSource: "backend" | "client" | null;
}

/**
 * Hook for fetching session workstreams
 *
 * By default, fetches from backend API.
 * Falls back to client-side transform if backend fails.
 */
export function useSessionWorkstreams(
  sessionId: string,
  options: UseSessionWorkstreamsOptions = {}
): UseSessionWorkstreamsResult {
  const { useBackend = true, sessionStatus } = options;

  // Always fetch captures (needed for both backend and client paths)
  const {
    data: captures,
    isLoading: capturesLoading,
    error: capturesError,
  } = useSessionCaptures(sessionId, sessionStatus);

  // Backend API query
  const {
    data: backendData,
    isLoading: backendLoading,
    error: backendError,
  } = useQuery({
    queryKey: ["session-workstreams", sessionId],
    queryFn: () => fetchSessionWorkstreams(sessionId),
    enabled: useBackend && !!sessionId,
    staleTime: 30000, // 30 seconds
    retry: 1, // Only retry once before falling back
  });

  // Client-side fallback transform
  const clientData = useMemo(() => {
    if (!captures || captures.length === 0) return null;

    // Filter to captures with activity data
    const filteredCaptures = captures.filter(
      (c) => c.activityDescription || c.deltaChangeDescription
    );

    return transformToWorkstreams(filteredCaptures);
  }, [captures]);

  // Determine final result
  const result = useMemo((): UseSessionWorkstreamsResult => {
    // If using backend and it succeeded
    if (useBackend && backendData && !backendError) {
      return {
        data: convertToFrontendFormat(backendData, captures || undefined),
        isLoading: false,
        error: null,
        dataSource: "backend",
      };
    }

    // If using backend but it failed, fall back to client
    if (useBackend && backendError && clientData) {
      return {
        data: clientData,
        isLoading: false,
        error: null,
        dataSource: "client",
      };
    }

    // If not using backend, use client-side only
    if (!useBackend && clientData) {
      return {
        data: clientData,
        isLoading: false,
        error: null,
        dataSource: "client",
      };
    }

    // Still loading
    if (backendLoading || capturesLoading) {
      return {
        data: null,
        isLoading: true,
        error: null,
        dataSource: null,
      };
    }

    // Error state
    const error = capturesError || (backendError as Error | null);
    return {
      data: null,
      isLoading: false,
      error,
      dataSource: null,
    };
  }, [
    useBackend,
    backendData,
    backendError,
    backendLoading,
    clientData,
    captures,
    capturesLoading,
    capturesError,
  ]);

  return result;
}

export default useSessionWorkstreams;
