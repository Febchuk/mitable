/**
 * useSessionWorkstreams Hook
 *
 * Fetches workstreams from the backend API with fallback to client-side transform.
 * Provides consistent workstream data regardless of the data source.
 * Supports automatic RLM force-analysis when heuristic results are detected.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useEffect, useRef, useCallback, useState } from "react";
import {
  fetchSessionWorkstreams,
  forceAnalyzeWorkstreams,
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
  /** Auto-trigger RLM analysis if heuristic results are returned. Default: true */
  autoAnalyze?: boolean;
}

interface UseSessionWorkstreamsResult {
  data: TransformedWorkstreams | null;
  isLoading: boolean;
  error: Error | null;
  /** Which source provided the data: "backend" | "client" | null */
  dataSource: "backend" | "client" | null;
  /** How backend generated workstreams: "rlm" (AI) or "heuristic" (pattern matching) */
  analysisSource: "rlm" | "heuristic" | null;
  /** Whether RLM analysis is currently running */
  isAnalyzing: boolean;
  /** Manually trigger RLM analysis */
  triggerAnalysis: () => Promise<void>;
  /** Refetch workstreams data */
  refetch: () => void;
}

/**
 * Hook for fetching session workstreams
 *
 * By default, fetches from backend API.
 * Falls back to client-side transform if backend fails.
 * Automatically triggers RLM analysis when heuristic results are detected.
 */
export function useSessionWorkstreams(
  sessionId: string,
  options: UseSessionWorkstreamsOptions = {}
): UseSessionWorkstreamsResult {
  const { useBackend = true, sessionStatus, autoAnalyze = true } = options;
  const queryClient = useQueryClient();

  // Track if we've already triggered analysis for this session
  const hasTriggeredAnalysis = useRef(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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
    refetch: refetchBackend,
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

  // Function to trigger RLM analysis
  const triggerAnalysis = useCallback(async () => {
    if (!sessionId || isAnalyzing) return;

    setIsAnalyzing(true);
    try {
      await forceAnalyzeWorkstreams(sessionId);
      // Refetch workstreams after analysis completes
      await queryClient.invalidateQueries({
        queryKey: ["session-workstreams", sessionId],
      });
    } catch (error) {
      console.error("[useSessionWorkstreams] RLM analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [sessionId, isAnalyzing, queryClient]);

  // Auto-trigger RLM analysis when heuristic results are detected
  useEffect(() => {
    if (
      autoAnalyze &&
      backendData?.analysisSource === "heuristic" &&
      !hasTriggeredAnalysis.current &&
      !isAnalyzing &&
      captures &&
      captures.length > 0 // Only analyze if there are captures
    ) {
      hasTriggeredAnalysis.current = true;
      console.log("[useSessionWorkstreams] Heuristic results detected, triggering RLM analysis");
      triggerAnalysis();
    }
  }, [autoAnalyze, backendData?.analysisSource, isAnalyzing, captures, triggerAnalysis]);

  // Reset the analysis trigger when session changes
  useEffect(() => {
    hasTriggeredAnalysis.current = false;
  }, [sessionId]);

  // Refetch function
  const refetch = useCallback(() => {
    refetchBackend();
  }, [refetchBackend]);

  // Determine final result
  const result = useMemo((): UseSessionWorkstreamsResult => {
    // If using backend and it succeeded
    if (useBackend && backendData && !backendError) {
      return {
        data: convertToFrontendFormat(backendData, captures || undefined),
        isLoading: false,
        error: null,
        dataSource: "backend",
        analysisSource: backendData.analysisSource || null,
        isAnalyzing,
        triggerAnalysis,
        refetch,
      };
    }

    // If using backend but it failed, fall back to client
    if (useBackend && backendError && clientData) {
      return {
        data: clientData,
        isLoading: false,
        error: null,
        dataSource: "client",
        analysisSource: null,
        isAnalyzing,
        triggerAnalysis,
        refetch,
      };
    }

    // If not using backend, use client-side only
    if (!useBackend && clientData) {
      return {
        data: clientData,
        isLoading: false,
        error: null,
        dataSource: "client",
        analysisSource: null,
        isAnalyzing,
        triggerAnalysis,
        refetch,
      };
    }

    // Still loading
    if (backendLoading || capturesLoading) {
      return {
        data: null,
        isLoading: true,
        error: null,
        dataSource: null,
        analysisSource: null,
        isAnalyzing,
        triggerAnalysis,
        refetch,
      };
    }

    // Error state
    const error = capturesError || (backendError as Error | null);
    return {
      data: null,
      isLoading: false,
      error,
      dataSource: null,
      analysisSource: null,
      isAnalyzing,
      triggerAnalysis,
      refetch,
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
    isAnalyzing,
    triggerAnalysis,
    refetch,
  ]);

  return result;
}

export default useSessionWorkstreams;
