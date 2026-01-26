/**
 * useStartSession Hook
 *
 * Encapsulates all logic for starting a monitoring session.
 * Used by MonitoringView, watching pill, and keyboard shortcuts.
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/console/src/context/UserContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { monitoringKeys } from "@/console/src/hooks/queries/monitoring";
import { createSession, startMonitoringSession } from "@/console/src/services/monitoringService";
import { authService } from "@/console/src/services/authService";
import { SESSION_DEFAULTS } from "@mitable/shared";
import { createLogger } from "../../../../lib/logger";

const logger = createLogger("useStartSession");

interface UseStartSessionOptions {
  /** Navigate to session detail after start (default: true) */
  navigateOnSuccess?: boolean;
  /** Show toast notifications (default: true) */
  showToasts?: boolean;
}

interface UseStartSessionReturn {
  /** Start a new session */
  startSession: () => Promise<string | null>;
  /** Whether a session is currently being started */
  isStarting: boolean;
  /** Error message if start failed */
  error: string | null;
}

/**
 * Hook for starting monitoring sessions.
 *
 * Handles:
 * - Creating backend session
 * - Starting Electron capture loop
 * - Focus tracker integration (windows added automatically)
 * - Toast notifications
 * - Navigation to session detail
 * - Query cache invalidation
 *
 * @example
 * const { startSession, isStarting } = useStartSession();
 * <Button onClick={startSession} disabled={isStarting}>Start</Button>
 */
export function useStartSession(options: UseStartSessionOptions = {}): UseStartSessionReturn {
  const { navigateOnSuccess = true, showToasts = true } = options;

  const { user } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSession = useCallback(async (): Promise<string | null> => {
    // Validate user is logged in
    if (!user?.id || !user?.organizationId) {
      const errorMsg = "Please log in to start a session";
      setError(errorMsg);
      if (showToasts) {
        toast({
          title: "Error",
          description: errorMsg,
          variant: "destructive",
        });
      }
      return null;
    }

    setIsStarting(true);
    setError(null);

    try {
      // 0. Ensure auth tokens are synced to main process BEFORE starting session
      // This is critical for frame analysis - the main process needs the token
      // to call /analyze-frame API. Without this, frames are saved as "pending".
      const accessToken = authService.getAccessToken();
      const refreshToken = authService.getRefreshToken();

      if (accessToken && window.consoleAPI?.setAuthTokens) {
        logger.info("Syncing auth tokens to main process before session start");
        window.consoleAPI.setAuthTokens(accessToken, refreshToken || "");
        // Small delay to ensure IPC message is processed
        await new Promise((resolve) => setTimeout(resolve, 150));
        logger.info("Auth token sync completed");
      } else {
        logger.warn("No access token available for main process sync");
      }

      // 1. Create backend session
      const backendResult = await createSession({
        selectedWindows: [], // Focus tracker adds windows dynamically
        captureIntervalMs: SESSION_DEFAULTS.CAPTURE_INTERVAL_MS,
        name: SESSION_DEFAULTS.DEFAULT_NAME,
      });

      const sessionId = backendResult.session.id;
      logger.info("Backend session created:", sessionId);

      // 2. Start Electron capture loop (focus tracker starts automatically)
      const electronResult = await startMonitoringSession({
        sessionId,
        selectedWindows: [], // Focus tracker adds windows based on user activity
        captureIntervalMs: SESSION_DEFAULTS.CAPTURE_INTERVAL_MS,
        name: SESSION_DEFAULTS.DEFAULT_NAME,
        userId: user.id,
        organizationId: user.organizationId,
      });

      if (electronResult.error) {
        throw new Error(electronResult.error);
      }

      logger.info("Session started successfully:", sessionId);

      // 3. Invalidate sessions query to refresh list
      queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });

      // 4. Show success toast
      if (showToasts) {
        toast({
          title: "Session started",
          description: "Your work session is now being tracked",
        });
      }

      // 5. Navigate to session detail
      if (navigateOnSuccess) {
        navigate(`/monitoring/${sessionId}`);
      }

      return sessionId;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to start session";
      logger.error("Failed to start session:", err);
      setError(errorMsg);

      if (showToasts) {
        toast({
          title: "Failed to start session",
          description: errorMsg,
          variant: "destructive",
        });
      }

      return null;
    } finally {
      setIsStarting(false);
    }
  }, [user, navigate, toast, queryClient, navigateOnSuccess, showToasts]);

  return {
    startSession,
    isStarting,
    error,
  };
}
