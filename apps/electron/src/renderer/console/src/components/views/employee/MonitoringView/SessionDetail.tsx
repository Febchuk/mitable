/**
 * SessionDetail
 *
 * Detailed view of a monitoring session.
 * Shows summary, allows editing, and provides delivery options.
 */

import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createLogger } from "../../../../../../lib/logger";

const logger = createLogger("SessionDetail");
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  useSession,
  useSessionSummary,
  useSessionStory,
  useUpdateSummary,
  useDeliverSummary,
  useDeleteSession,
  useSlackChannels,
  useSlackUsers,
  useReviseSummary,
  useUpdateSession,
  useTriggerIntermediateSummary,
  monitoringKeys,
} from "@/console/src/hooks/queries/monitoring";
import { checkGmailConnection, startGmailOAuth } from "@/console/src/services/monitoringService";
import { API_BASE_URL } from "@/console/src/lib/config";
import {
  ArrowLeft,
  Edit2,
  Send,
  Trash2,
  Loader2,
  Square,
  Pause,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Mail,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import AIEditPanel from "@/console/src/components/shared/AIEditPanel";
import RecipientSelector from "@/console/src/components/shared/RecipientSelector";
import { SessionEndToast } from "@/console/src/components/shared/SessionEndToast";
import { usePreferences } from "@/console/src/hooks/usePreferences";
import LinearUpdateDialog from "./LinearUpdateDialog";
// import ActivityTimeline from "./ActivityTimeline";
import SessionTimeline from "./SessionTimeline";
import SummarizationProgress from "./SummarizationProgress";
import SessionDetailSkeleton from "./SessionDetailSkeleton";
import { SiLinear } from "react-icons/si";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { getLocale } from "@/console/src/lib/date";

marked.setOptions({ breaks: true, gfm: true });

function formatDateTime(dateString: string | null): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleString(getLocale(), {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function SessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Initialize from URL params synchronously so the first render already shows
  // "Ending session..." when arriving from the pill (avoids flash of active UI)
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("summaryToast") === "true") return "summarizing";
    return null;
  });

  // Poll for updates while session is summarizing
  const { data: session, isLoading: isLoadingSession } = useSession(sessionId || "", {
    pollWhileSummarizing: true,
  });
  const sessionStatus = optimisticStatus ?? session?.status;
  const summaryStatusForPolling = sessionStatus;
  const { data: summaryData, isLoading: isLoadingSummary } = useSessionSummary(
    sessionId || "",
    summaryStatusForPolling // Polls every 2s when "summarizing" (including during regeneration)
  );
  const { data: slackChannels = [], isLoading: isLoadingChannels } = useSlackChannels();
  const { data: slackUsers = [], isLoading: isLoadingUsers } = useSlackUsers();

  const summary =
    summaryData?.summary?.narrativeSummary ||
    summaryData?.finalSummary ||
    summaryData?.rawSummary ||
    "";
  const hasSummary = summary.trim().length > 0;

  // Convert markdown → HTML once using marked (same renderer as the editor)
  const summaryHtml = useMemo(() => {
    if (!summary) return "";
    const result = marked.parse(summary);
    return typeof result === "string" ? DOMPurify.sanitize(result) : "";
  }, [summary]);
  const uiStatus = hasSummary ? "ready" : sessionStatus;
  const isEndingState = sessionStatus === "summarizing" && !hasSummary;

  // Fetch progressive story (polls while session is active/paused)
  const { data: storyData } = useSessionStory(sessionId || "", uiStatus);

  const updateSummaryMutation = useUpdateSummary();
  const deliverSummaryMutation = useDeliverSummary();
  const deleteSessionMutation = useDeleteSession();
  const reviseSummaryMutation = useReviseSummary();
  const updateSessionMutation = useUpdateSession();
  const triggerIntermediateSummaryMutation = useTriggerIntermediateSummary();

  const [isAIEditMode, setIsAIEditMode] = useState(false);
  const [isPauseLoading, setIsPauseLoading] = useState(false);
  const [isDeliveryDialogOpen, setIsDeliveryDialogOpen] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [isLinearDialogOpen, setIsLinearDialogOpen] = useState(false);
  const [isStoryExpanded, setIsStoryExpanded] = useState(true);
  // const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [gmailStatus, setGmailStatus] = useState<{
    connected: boolean;
    email: string | null;
    loading: boolean;
  }>({ connected: false, email: null, loading: true });
  const [isConnectingGmail, setIsConnectingGmail] = useState(false);
  const [showSessionEndToast, setShowSessionEndToast] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const [isExternallyTriggered, setIsExternallyTriggered] = useState(false);

  // Preferences for hide pill on session end
  const { hidePillOnSessionEnd, dontAskHidePillAgain, updatePreference } = usePreferences();

  // Check for URL param to open end dialog (triggered from pill via App.tsx navigation)
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get("openEndDialog") === "true") {
      logger.info("End session triggered via URL param from pill");
      setIsExternallyTriggered(true);
      navigate(`/monitoring/${sessionId}`, { replace: true });
      // Directly end — no dialog needed
      handleEndSession();
    }
  }, [location.search, sessionId, navigate]);

  // Show summary toast when navigated from pill with silent end-session flow
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get("summaryToast") === "true") {
      toast({
        title: "Session Ended",
        description: "Generating your master story...",
      });
      setOptimisticStatus("summarizing");
      queryClient.invalidateQueries({ queryKey: monitoringKeys.session(sessionId || "") });
      queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      // Clean up URL param (replace to avoid back button issues)
      navigate(`/monitoring/${sessionId}`, { replace: true });
    }
  }, [location.search, sessionId, navigate, toast, queryClient]);

  useEffect(() => {
    if (!optimisticStatus) return;
    // Clear optimistic status only when:
    // 1. Summary data has arrived, OR
    // 2. Backend has moved PAST "summarizing" to a terminal state (e.g. "ready")
    // Do NOT clear when session is still "active"/"paused" — that's the cached
    // pre-end state before the backend has processed the end request.
    const backendStatus = session?.status;
    const backendPastSummarizing =
      backendStatus &&
      backendStatus !== "active" &&
      backendStatus !== "paused" &&
      backendStatus !== "summarizing";

    if (hasSummary || backendPastSummarizing) {
      setOptimisticStatus(null);
      // Force-refetch summary when session exits "summarizing" but we don't have data yet.
      // Without this, summary polling stops (status is no longer "summarizing") while
      // the cached response is stale from before the summary was saved.
      if (!hasSummary && sessionId) {
        queryClient.invalidateQueries({ queryKey: monitoringKeys.summary(sessionId) });
      }
    }
  }, [optimisticStatus, hasSummary, session?.status, sessionId, queryClient]);

  // Show native notification when summarization reaches "writing_summary"
  const [hasShownWritingNotif, setHasShownWritingNotif] = useState(false);
  useEffect(() => {
    if (session?.summarizationProgress === "writing_summary" && !hasShownWritingNotif) {
      setHasShownWritingNotif(true);
      window.consoleAPI?.showNotification?.({
        title: "Summary is being written",
        message: "Feel free to do other stuff — we'll have it ready when you come back.",
        actions: [{ id: "dismiss", label: "Got it", primary: true }],
        timeout: 8000,
      });
    }
    if (session?.status !== "summarizing") {
      setHasShownWritingNotif(false);
    }
  }, [session?.summarizationProgress, session?.status, hasShownWritingNotif]);

  // Listen for session updates from watch pill (e.g., pause/resume)
  useEffect(() => {
    if (!sessionId) return;

    const unsubscribe = window.consoleAPI?.onMonitoringSessionUpdate?.(() => {
      // Invalidate session query to force refetch when state changes from watch pill
      queryClient.invalidateQueries({ queryKey: monitoringKeys.session(sessionId) });
    });

    return () => {
      unsubscribe?.();
    };
  }, [sessionId, queryClient]);

  // Check Gmail connection status
  useEffect(() => {
    const checkGmail = async () => {
      try {
        const status = await checkGmailConnection();
        setGmailStatus({
          connected: status.connected,
          email: status.email,
          loading: false,
        });
      } catch {
        setGmailStatus({ connected: false, email: null, loading: false });
      }
    };
    checkGmail();
  }, []);

  // Handle Gmail connect button
  const handleConnectGmail = async () => {
    setIsConnectingGmail(true);
    try {
      const { authUrl } = await startGmailOAuth();
      // Open auth URL in system browser
      window.open(authUrl, "_blank");
      toast({
        title: "Gmail Authorization",
        description: "Complete the authorization in your browser, then come back here.",
      });
      // Poll for connection status
      const pollInterval = setInterval(async () => {
        const status = await checkGmailConnection();
        if (status.connected) {
          clearInterval(pollInterval);
          setGmailStatus({ connected: true, email: status.email, loading: false });
          setIsConnectingGmail(false);
          toast({
            title: "Gmail Connected",
            description: `Connected as ${status.email}`,
          });
        }
      }, 2000);
      // Stop polling after 2 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setIsConnectingGmail(false);
      }, 120000);
    } catch (error) {
      logger.error("Error starting Gmail OAuth:", error);
      toast({
        title: "Error",
        description: "Failed to start Gmail authorization. Please try again.",
        variant: "destructive",
      });
      setIsConnectingGmail(false);
    }
  };

  // Handle Linear button click - check connection and open dialog or redirect to settings
  const handleLinearClick = async () => {
    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        navigate("/settings");
        return;
      }
      const response = await fetch(`${API_BASE_URL}/api/integrations/linear/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.connected) {
          setIsLinearDialogOpen(true);
        } else {
          toast({
            title: "Linear Not Connected",
            description: "Please connect your Linear account in Settings first.",
          });
          navigate("/settings");
        }
      } else {
        navigate("/settings");
      }
    } catch (error) {
      logger.error("Error checking Linear status:", error);
      navigate("/settings");
    }
  };
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);

  const handleSaveSummary = async (content: string) => {
    if (!sessionId) return;

    await updateSummaryMutation.mutateAsync({
      sessionId,
      summary: content,
    });
    setIsAIEditMode(false);
    toast({
      title: "Summary saved",
      description: "Your changes have been saved successfully.",
    });
  };

  const handleRevise = async (instruction: string, currentContent: string) => {
    if (!sessionId) throw new Error("No session ID");

    const result = await reviseSummaryMutation.mutateAsync({
      sessionId,
      instruction,
      currentSummary: currentContent,
    });
    return result;
  };

  const handleDeliverSummary = async () => {
    if (!sessionId || selectedRecipients.length === 0) return;

    // Build targets array from selected recipients
    const targets = selectedRecipients.map((id) => {
      const channel = slackChannels.find((c) => c.id === id);
      const user = slackUsers.find((u) => u.id === id);
      return {
        type: channel ? ("channel" as const) : ("dm" as const),
        id,
        name: channel?.name || user?.display_name || user?.real_name || user?.name,
      };
    });

    try {
      await deliverSummaryMutation.mutateAsync({
        sessionId,
        targets,
      });
      setIsDeliveryDialogOpen(false);
      setSelectedRecipients([]);

      // Build description based on targets
      const channelCount = targets.filter((t) => t.type === "channel").length;
      const dmCount = targets.filter((t) => t.type === "dm").length;
      const parts = [];
      if (channelCount > 0) parts.push(`${channelCount} channel${channelCount !== 1 ? "s" : ""}`);
      if (dmCount > 0) parts.push(`${dmCount} person${dmCount !== 1 ? "s" : ""}`);

      toast({
        title: "Summary delivered",
        description: `Summary has been sent to ${parts.join(" and ")}.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to deliver summary. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleEmailDeliver = async () => {
    if (!sessionId || !emailInput.trim()) return;

    // Parse comma-separated emails
    const emails = emailInput
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    if (emails.length === 0) return;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter((e) => !emailRegex.test(e));
    if (invalidEmails.length > 0) {
      toast({
        title: "Invalid email",
        description: `Invalid email address: ${invalidEmails[0]}`,
        variant: "destructive",
      });
      return;
    }

    // Build targets array for email delivery
    const targets = emails.map((email, index) => ({
      type: "email" as const,
      id: `email-${index}`,
      email,
    }));

    try {
      await deliverSummaryMutation.mutateAsync({
        sessionId,
        targets,
        channel: "email",
      });
      setIsEmailDialogOpen(false);
      setEmailInput("");

      toast({
        title: "Summary sent",
        description: `Summary has been emailed to ${emails.length} recipient${emails.length !== 1 ? "s" : ""}.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send email. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSession = async () => {
    if (!sessionId) return;

    try {
      await deleteSessionMutation.mutateAsync(sessionId);

      // Reset Electron-side session state (in case this was the active session)
      try {
        await window.consoleAPI.resetMonitoringSession();
      } catch {
        // Ignore reset errors - session may already be cleared
      }

      navigate("/monitoring");
      toast({
        title: "Session deleted",
        description: "The session has been deleted.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete session. Please try again.",
        variant: "destructive",
      });
    }
  };

  // End session — no preferences needed, Storyteller handles formatting
  const handleEndSession = async () => {
    if (!sessionId) return;

    setOptimisticStatus("summarizing");
    const wasExternallyTriggered = isExternallyTriggered;
    setIsExternallyTriggered(false);

    toast({
      title: "Session Ended",
      description: "Generating your master story...",
    });

    if (!wasExternallyTriggered) {
      if (hidePillOnSessionEnd || dontAskHidePillAgain) {
        window.consoleAPI.hidePill();
      } else {
        setShowSessionEndToast(true);
      }
    }

    try {
      if (wasExternallyTriggered) {
        logger.info("Ending session via pill trigger");
        const result = await window.consoleAPI.endSessionFull();

        if (!result.success) {
          throw new Error(result.error || "Failed to end session");
        }

        queryClient.invalidateQueries({ queryKey: monitoringKeys.session(sessionId) });
        queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });
        queryClient.invalidateQueries({ queryKey: ["calendar"] });
      } else {
        // Triggered from Console — use the unified IPC path too
        logger.info("Ending session via console");
        const result = await window.consoleAPI.endSessionFull();

        if (!result.success) {
          throw new Error(result.error || "Failed to end session");
        }

        queryClient.invalidateQueries({ queryKey: monitoringKeys.session(sessionId) });
        queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });
        queryClient.invalidateQueries({ queryKey: ["calendar"] });
      }
    } catch (error) {
      logger.error("Error ending session:", error);
      setOptimisticStatus(null);
      toast({
        title: "Error",
        description: "Failed to end session properly.",
        variant: "destructive",
      });
    }
  };

  // Handlers for session end toast
  const handleDontAskAgain = async (checked: boolean) => {
    if (checked) {
      await updatePreference("dontAskHidePillAgain", true);
    }
  };

  const handleHidePillFromToast = () => {
    window.consoleAPI.hidePill();
    setShowSessionEndToast(false);
    toast({
      title: "Session ended",
      description: "Summary is being generated...",
    });
  };

  const handleDismissSessionEndToast = () => {
    setShowSessionEndToast(false);
    toast({
      title: "Session ended",
      description: "Summary is being generated...",
    });
  };

  const handlePauseSession = async () => {
    if (!sessionId) return;
    setIsPauseLoading(true);
    try {
      // Pause in Electron (stops capture loop)
      await window.consoleAPI.pauseMonitoringSession();
      // Update backend status
      await updateSessionMutation.mutateAsync({ sessionId, action: "pause" });
      toast({
        title: "Session paused",
        description: "Screenshot capture has been paused.",
      });
    } catch (error) {
      logger.error("Error pausing session:", error);
      toast({
        title: "Error",
        description: "Failed to pause session.",
        variant: "destructive",
      });
    } finally {
      setIsPauseLoading(false);
    }
  };

  const handleResumeSession = async () => {
    if (!sessionId) return;
    setIsPauseLoading(true);
    try {
      // Resume in Electron (restarts capture loop)
      await window.consoleAPI.resumeMonitoringSession();
      // Update backend status
      await updateSessionMutation.mutateAsync({ sessionId, action: "resume" });
      toast({
        title: "Session resumed",
        description: "Screenshot capture has resumed.",
      });
    } catch (error) {
      logger.error("Error resuming session:", error);
      toast({
        title: "Error",
        description: "Failed to resume session.",
        variant: "destructive",
      });
    } finally {
      setIsPauseLoading(false);
    }
  };

  if (isLoadingSession || isLoadingSummary) {
    // When arriving from pill end-session, show "Ending session..." immediately
    // instead of a generic spinner while data loads (~500-600ms)
    if (optimisticStatus === "summarizing") {
      return (
        <div className="p-8 space-y-6 app-no-drag">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/monitoring")}
                className="text-text-secondary hover:text-text-primary hover:bg-background-elevated"
              >
                <ArrowLeft size={20} />
              </Button>
              <div>
                <h1 className="font-display text-2xl font-semibold text-ink-primary tracking-tight">
                  <span className="flex items-center gap-2">
                    <Loader2 className="animate-spin" size={20} />
                    Generating title...
                  </span>
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-background-elevated px-3 py-2 text-text-secondary">
              <Loader2 className="animate-spin" size={16} />
              Ending session...
            </div>
          </div>
        </div>
      );
    }
    return <SessionDetailSkeleton />;
  }

  if (!session) {
    return (
      <div className="p-8 text-center">
        <p className="text-text-secondary">Session not found</p>
        <Button variant="link" onClick={() => navigate("/monitoring")} className="mt-4">
          Back to sessions
        </Button>
      </div>
    );
  }

  const isDelivered = session.deliveryStatus === "delivered";

  // AI Edit Mode - full screen split-pane editor
  if (isAIEditMode && summary) {
    return (
      <AIEditPanel
        title="Edit Summary"
        subtitle={session.name || "Work Session"}
        initialContent={summary}
        onSave={handleSaveSummary}
        onAutoSave={async (content: string) => {
          if (!sessionId) return;
          await updateSummaryMutation.mutateAsync({ sessionId, summary: content });
        }}
        onCancel={() => setIsAIEditMode(false)}
        onRevise={handleRevise}
        placeholder="Edit your session summary..."
        contextLabel="session summary"
        sessionId={sessionId}
      />
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 app-no-drag min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/monitoring")}
            className="text-text-secondary hover:text-text-primary hover:bg-background-elevated flex-shrink-0"
          >
            <ArrowLeft size={20} />
          </Button>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold text-ink-primary tracking-tight truncate">
              {!session.name && isEndingState ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="animate-spin" size={20} />
                  Generating title...
                </span>
              ) : (
                session.name || "Work session"
              )}
            </h1>
            <p className="text-ink-secondary text-sm mt-1">{formatDateTime(session.startedAt)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {uiStatus === "active" && (
            <>
              <Button
                onClick={handlePauseSession}
                disabled={isPauseLoading}
                variant="outline"
                className="gap-2"
              >
                {isPauseLoading ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Pause size={16} />
                )}
                Pause
              </Button>
              <Button
                onClick={handleEndSession}
                className="gap-2 bg-status-error text-white hover:bg-status-error/90"
              >
                <Square size={16} />
                End Session
              </Button>
            </>
          )}
          {uiStatus === "paused" && (
            <>
              <Button
                onClick={handleResumeSession}
                disabled={isPauseLoading}
                className="gap-2 bg-status-success text-white hover:bg-status-success/90"
              >
                {isPauseLoading ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Play size={16} />
                )}
                Resume
              </Button>
              <Button
                onClick={handleEndSession}
                variant="outline"
                className="gap-2 border-status-error text-status-error hover:bg-status-error/10"
              >
                <Square size={16} />
                End Session
              </Button>
            </>
          )}
          {uiStatus !== "active" &&
            uiStatus !== "paused" &&
            !isEndingState &&
            (isDelivered ? (
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-medium text-emerald bg-emerald/10">
                  Delivered
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-text-secondary hover:text-text-primary hover:bg-transparent"
                    >
                      <RefreshCw size={14} />
                      Resend
                      <ChevronDown size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={handleLinearClick} disabled={!summary}>
                      <SiLinear className="w-4 h-4 mr-2 text-[#5E6AD2]" />
                      Send to Linear
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setIsDeliveryDialogOpen(true)}
                      disabled={!summary}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Send to Slack
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setIsEmailDialogOpen(true)}
                      disabled={!summary}
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Send via Email
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <>
                <Button
                  onClick={handleLinearClick}
                  disabled={!summary}
                  className="gap-2 border border-[#5E6AD2] text-[#5E6AD2] bg-transparent hover:bg-[#5E6AD2]/10 focus-visible:outline-none focus-visible:ring-0"
                >
                  <SiLinear size={14} />
                  Send to Linear
                </Button>
                <Button
                  onClick={() => setIsDeliveryDialogOpen(true)}
                  disabled={!summary}
                  className="gap-2 bg-primary text-white hover:bg-primary/90"
                >
                  <Send size={16} />
                  Send to Slack
                </Button>
                <Button
                  onClick={() => setIsEmailDialogOpen(true)}
                  disabled={!summary}
                  variant="outline"
                  className="gap-2"
                >
                  <Mail size={16} />
                  Send via Email
                </Button>
              </>
            ))}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDeleteDialogOpen(true)}
            disabled={isEndingState}
            className="text-status-error hover:text-status-error hover:bg-status-error/10"
          >
            <Trash2 size={18} />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm border-b border-stroke-subtle pb-6">
        <span className="text-ink-secondary">
          Duration:{" "}
          <span className="text-ink-primary font-medium">
            {session.endedAt
              ? formatDuration(
                  new Date(session.startedAt),
                  new Date(session.endedAt),
                  session.totalPausedMs
                )
              : "In progress"}
          </span>
        </span>
        {session.deliveredAt && (
          <span className="text-ink-secondary">
            Delivered:{" "}
            <span className="text-ink-primary font-medium">
              {formatDateTime(session.deliveredAt)}
            </span>
          </span>
        )}
      </div>

      {/* Progressive Story Section - Shows during active/paused sessions */}
      {(uiStatus === "active" || uiStatus === "paused") && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsStoryExpanded(!isStoryExpanded)}
              className="flex items-center gap-2 flex-1 text-left group"
            >
              <h2 className="font-display text-base font-semibold text-ink-primary tracking-tight">
                Live Progress
              </h2>
              {storyData?.intermediateSummary?.enabled && (
                <span className="text-xs text-ink-tertiary">
                  (updates every{" "}
                  {Math.round((storyData.intermediateSummary.intervalMs || 1800000) / 60000)}m)
                </span>
              )}
              <div className="flex-1" />
              {storyData?.metadata?.version ? (
                <span className="text-xs text-ink-tertiary tabular-nums">
                  v{storyData.metadata.version}
                </span>
              ) : null}
              {isStoryExpanded ? (
                <ChevronUp size={16} className="text-ink-tertiary group-hover:text-ink-primary" />
              ) : (
                <ChevronDown size={16} className="text-ink-tertiary group-hover:text-ink-primary" />
              )}
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                triggerIntermediateSummaryMutation.mutate(sessionId!, {
                  onSuccess: () => {
                    toast({
                      title: "Progress updated",
                      description: "Live progress has been refreshed.",
                      duration: 3000,
                    });
                  },
                  onError: (error) => {
                    toast({
                      title: "Update failed",
                      description:
                        error instanceof Error ? error.message : "Failed to update progress",
                      variant: "destructive",
                    });
                  },
                });
              }}
              disabled={
                triggerIntermediateSummaryMutation.isPending ||
                storyData?.intermediateSummary?.status === "generating"
              }
              className="gap-1.5 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
            >
              {triggerIntermediateSummaryMutation.isPending ||
              storyData?.intermediateSummary?.status === "generating" ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <RefreshCw size={14} />
                  Update Now
                </>
              )}
            </Button>
          </div>

          {isStoryExpanded && (
            <div className="bg-canvas-overlay rounded-xl border border-indigo/20 p-4">
              {storyData?.story ? (
                <>
                  <div className="prose prose-invert prose-sm max-w-none">
                    {storyData.story.split("\n").map((paragraph, i) => (
                      <p
                        key={i}
                        className="text-ink-primary mb-2 last:mb-0 text-sm leading-relaxed"
                      >
                        {paragraph || <br />}
                      </p>
                    ))}
                  </div>
                  {(storyData.metadata?.lastUpdated ||
                    storyData.intermediateSummary?.lastUpdatedAt) && (
                    <div className="mt-3 pt-2 border-t border-stroke-subtle text-xs text-ink-tertiary tabular-nums">
                      Last updated:{" "}
                      {new Date(
                        storyData.intermediateSummary?.lastUpdatedAt ||
                          storyData.metadata?.lastUpdated ||
                          ""
                      ).toLocaleTimeString()}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-4">
                  {triggerIntermediateSummaryMutation.isPending ||
                  storyData?.intermediateSummary?.status === "generating" ? (
                    <div className="flex items-center justify-center gap-2 text-ink-secondary">
                      <Loader2 size={16} className="animate-spin" />
                      <span className="text-sm">Generating progress summary...</span>
                    </div>
                  ) : (
                    <p className="text-sm text-ink-secondary">
                      No progress summary yet. Click "Update Now" to generate one.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Summary Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-ink-primary tracking-tight">
            Summary
          </h2>
          <div className="flex items-center gap-2">
            {summary && (
              <Button
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(summary);
                  setIsCopied(true);
                  toast({ title: "Copied to clipboard", duration: 2000 });
                  setTimeout(() => setIsCopied(false), 2000);
                }}
                className="gap-2 text-text-secondary hover:text-text-primary hover:bg-background-elevated"
              >
                {isCopied ? <Check size={16} /> : <Copy size={16} />}
                {isCopied ? "Copied" : "Copy"}
              </Button>
            )}
            {!isDelivered && summary && (
              <Button
                variant="ghost"
                onClick={() => setIsAIEditMode(true)}
                className="gap-2 text-text-secondary hover:text-text-primary hover:bg-background-elevated"
              >
                <Edit2 size={16} />
                Edit
              </Button>
            )}
          </div>
        </div>

        {summary ? (
          <div className="bg-canvas-overlay rounded-xl border border-stroke-subtle p-6 max-h-[400px] overflow-y-auto">
            <div className="prose prose-invert prose-sm max-w-none break-words [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-white [&_h1]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-white/90 [&_h3]:mb-2 [&_p]:text-ink-primary [&_p]:text-sm [&_p]:leading-relaxed [&_p]:mb-3 [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:list-disc [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_li]:text-ink-primary [&_li]:text-sm [&_li]:leading-relaxed [&_li]:mb-1 [&_li]:marker:text-ink-tertiary [&_strong]:text-white [&_strong]:font-semibold [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:hover:text-primary/80 [&_hr]:border-stroke-subtle [&_hr]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/30 [&_blockquote]:pl-4 [&_blockquote]:text-ink-secondary [&_blockquote]:italic [&_code]:bg-white/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:text-primary">
              <div dangerouslySetInnerHTML={{ __html: summaryHtml }} />
            </div>
          </div>
        ) : (
          <div className="bg-canvas-overlay rounded-xl border border-stroke-subtle p-8 text-center">
            {uiStatus === "summarizing" ? (
              <SummarizationProgress progress={session.summarizationProgress ?? null} />
            ) : (
              <p className="text-sm text-ink-secondary">No summary available for this session.</p>
            )}
          </div>
        )}
      </div>

      {/* Workstream Timeline (new visualization) */}
      <SessionTimeline sessionId={sessionId || ""} sessionStatus={sessionStatus} />

      {/* Activity Timeline (original) - commented out */}
      {/* <ActivityTimeline sessionId={sessionId || ""} sessionStatus={sessionStatus} /> */}

      {/* Top-K Frames Gallery - commented out
      {session.topKFrames && session.topKFrames.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-display text-base font-semibold text-ink-primary tracking-tight">
            Key Frames{" "}
            <span className="text-ink-tertiary font-normal">({session.topKFrames.length})</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {session.topKFrames.map((frame: any) => (
              <div
                key={frame.id}
                className="group relative bg-canvas-overlay rounded-xl border border-stroke-subtle overflow-hidden cursor-pointer hover:border-stroke transition-colors"
                onClick={() => setSelectedFrame(frame.id)}
              >
                {frame.imageData ? (
                  <img
                    src={`data:image/png;base64,${frame.imageData}`}
                    alt={frame.activityDescription || "Session capture"}
                    className="w-full aspect-video object-cover"
                  />
                ) : (
                  <div className="w-full aspect-video bg-canvas-muted flex items-center justify-center">
                    <span className="text-sm text-ink-tertiary">No preview</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-canvas-base/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-0 left-0 right-0 p-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-ink-primary text-xs line-clamp-2">
                    {frame.activityDescription || frame.appName || "Captured frame"}
                  </p>
                  <p className="text-ink-tertiary text-xs mt-1 tabular-nums">
                    {new Date(frame.capturedAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      */}

      {/* Frame Preview Dialog - commented out
      <Dialog open={!!selectedFrame} onOpenChange={() => setSelectedFrame(null)}>
        <DialogContent className="bg-canvas-raised border-stroke-subtle max-w-4xl">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold text-ink-primary tracking-tight">
              Frame Preview
            </DialogTitle>
          </DialogHeader>
          {selectedFrame &&
            (() => {
              const frame = session.topKFrames?.find((f: any) => f.id === selectedFrame);
              if (!frame) return null;
              return (
                <div className="space-y-4">
                  {frame.imageData ? (
                    <img
                      src={`data:image/png;base64,${frame.imageData}`}
                      alt={frame.activityDescription || "Session capture"}
                      className="w-full rounded-xl"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-canvas-muted flex items-center justify-center rounded-xl">
                      <span className="text-sm text-ink-tertiary">No preview available</span>
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-ink-primary text-sm">
                      {frame.activityDescription || "No description available"}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-ink-secondary">
                      <span>{frame.appName || "Unknown app"}</span>
                      <span className="text-ink-tertiary">·</span>
                      <span className="tabular-nums">
                        {new Date(frame.capturedAt).toLocaleString()}
                      </span>
                      {frame.importanceScore && (
                        <>
                          <span className="text-ink-tertiary">·</span>
                          <span className="text-indigo tabular-nums">
                            {(frame.importanceScore * 100).toFixed(0)}%
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>
      */}

      {/* Delivery Dialog */}
      <Dialog open={isDeliveryDialogOpen} onOpenChange={setIsDeliveryDialogOpen}>
        <DialogContent className="bg-background-primary border-border-subtle max-w-md">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Send to Slack</DialogTitle>
            <DialogDescription className="text-text-secondary">
              Choose channels and people to share your session summary with.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <RecipientSelector
              channels={slackChannels}
              users={slackUsers}
              selectedIds={selectedRecipients}
              onSelectionChange={setSelectedRecipients}
              isLoading={isLoadingChannels || isLoadingUsers}
              disabled={deliverSummaryMutation.isPending}
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDeliveryDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDeliverSummary}
              disabled={selectedRecipients.length === 0 || deliverSummaryMutation.isPending}
              className="bg-primary text-white hover:bg-primary/90"
            >
              {deliverSummaryMutation.isPending ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={16} />
                  Sending...
                </>
              ) : (
                `Send${selectedRecipients.length > 0 ? ` (${selectedRecipients.length})` : ""}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Delivery Dialog */}
      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogContent className="bg-background-primary border-border-subtle max-w-md">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Send via Email</DialogTitle>
            <DialogDescription className="text-text-secondary">
              {gmailStatus.connected
                ? `Send from ${gmailStatus.email}. Enter recipient email addresses below.`
                : "Connect your Gmail account to send session summaries via email."}
            </DialogDescription>
          </DialogHeader>

          {gmailStatus.loading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="animate-spin text-text-secondary" size={24} />
            </div>
          ) : gmailStatus.connected ? (
            <>
              <div className="py-2">
                <input
                  type="text"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="email@example.com, another@example.com"
                  className="w-full px-3 py-2 bg-background-secondary border border-border-subtle rounded-md text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  disabled={deliverSummaryMutation.isPending}
                />
                <p className="text-xs text-text-tertiary mt-2">
                  Separate multiple emails with commas
                </p>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsEmailDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleEmailDeliver}
                  disabled={!emailInput.trim() || deliverSummaryMutation.isPending}
                  className="bg-primary text-white hover:bg-primary/90"
                >
                  {deliverSummaryMutation.isPending ? (
                    <>
                      <Loader2 className="animate-spin mr-2" size={16} />
                      Sending...
                    </>
                  ) : (
                    "Send Email"
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="py-4 space-y-4">
              <div className="text-center p-4 bg-background-secondary rounded-lg border border-border-subtle">
                <Mail className="mx-auto mb-3 text-text-tertiary" size={32} />
                <p className="text-sm text-text-secondary mb-4">
                  Connect your Gmail account to send session summaries directly from your email
                  address.
                </p>
                <Button
                  onClick={handleConnectGmail}
                  disabled={isConnectingGmail}
                  className="gap-2 bg-primary text-white hover:bg-primary/90"
                >
                  {isConnectingGmail ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Mail size={16} />
                      Connect Gmail
                    </>
                  )}
                </Button>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsEmailDialogOpen(false)}>
                  Cancel
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="bg-background-primary border-border-subtle">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Delete Session</DialogTitle>
            <DialogDescription className="text-text-secondary">
              Are you sure you want to delete this session? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDeleteSession}
              disabled={deleteSessionMutation.isPending}
              className="bg-status-error text-white hover:bg-status-error/90"
            >
              {deleteSessionMutation.isPending ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={16} />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Linear Update Dialog */}
      <LinearUpdateDialog
        open={isLinearDialogOpen}
        onOpenChange={setIsLinearDialogOpen}
        sessionId={sessionId || ""}
        sessionName={session.name || "Work Session"}
        summary={summary}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["monitoring", "session", sessionId] });
          queryClient.invalidateQueries({ queryKey: ["monitoring", "sessions"] });
        }}
      />

      {/* Session End Toast */}
      {showSessionEndToast && (
        <div className="fixed bottom-4 right-4 z-50">
          <SessionEndToast
            onDismiss={handleDismissSessionEndToast}
            onDontAskAgain={handleDontAskAgain}
            onHidePill={handleHidePillFromToast}
          />
        </div>
      )}
    </div>
  );
}

function formatDuration(start: Date, end: Date, pausedMs: number = 0): string {
  const totalMs = end.getTime() - start.getTime() - pausedMs;
  const hours = Math.floor(totalMs / (1000 * 60 * 60));
  const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
