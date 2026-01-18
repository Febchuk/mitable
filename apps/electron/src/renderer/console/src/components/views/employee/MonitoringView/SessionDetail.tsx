/**
 * SessionDetail
 *
 * Detailed view of a monitoring session.
 * Shows summary, allows editing, and provides delivery options.
 */

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createLogger } from "../../../../../../lib/logger";

const logger = createLogger("SessionDetail");
import { useParams, useNavigate } from "react-router-dom";
import {
  useSession,
  useSessionSummary,
  useSessionStory,
  useUpdateSummary,
  useDeliverSummary,
  useDeleteSession,
  useEndSession,
  useSlackChannels,
  useSlackUsers,
  useReviseSummary,
  useUpdateSession,
  monitoringKeys,
} from "@/console/src/hooks/queries/monitoring";
import {
  uploadCaptures,
  checkGmailConnection,
  startGmailOAuth,
} from "@/console/src/services/monitoringService";
import { API_BASE_URL } from "@/console/src/lib/config";
import {
  ArrowLeft,
  Clock,
  Camera,
  Edit2,
  Send,
  Trash2,
  CheckCircle,
  Loader2,
  Square,
  Pause,
  Play,
  RefreshCw,
  ChevronDown,
  BookOpen,
  ChevronUp,
  Image,
  Mail,
  StopCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import ActivityTimeline from "./ActivityTimeline";
import EndSessionDialog from "./EndSessionDialog"; // Import the new dialog
import { SiLinear } from "react-icons/si";

function formatDateTime(dateString: string | null): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Poll for updates while session is summarizing
  const { data: session, isLoading: isLoadingSession } = useSession(sessionId || "", {
    pollWhileSummarizing: true,
  });
  const { data: summaryData, isLoading: isLoadingSummary } = useSessionSummary(
    sessionId || "",
    session?.status // Pass status for conditional polling
  );
  const { data: slackChannels = [], isLoading: isLoadingChannels } = useSlackChannels();
  const { data: slackUsers = [], isLoading: isLoadingUsers } = useSlackUsers();

  // Fetch progressive story (polls while session is active/paused)
  const { data: storyData } = useSessionStory(sessionId || "", session?.status);

  const updateSummaryMutation = useUpdateSummary();
  const deliverSummaryMutation = useDeliverSummary();
  const deleteSessionMutation = useDeleteSession();
  const endSessionMutation = useEndSession();
  const reviseSummaryMutation = useReviseSummary();
  const updateSessionMutation = useUpdateSession();

  const [isAIEditMode, setIsAIEditMode] = useState(false);
  const [isPauseLoading, setIsPauseLoading] = useState(false);
  const [isDeliveryDialogOpen, setIsDeliveryDialogOpen] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [isLinearDialogOpen, setIsLinearDialogOpen] = useState(false);
  const [isStoryExpanded, setIsStoryExpanded] = useState(true);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const [gmailStatus, setGmailStatus] = useState<{
    connected: boolean;
    email: string | null;
    loading: boolean;
  }>({ connected: false, email: null, loading: true });
  const [isConnectingGmail, setIsConnectingGmail] = useState(false);
  const [showSessionEndToast, setShowSessionEndToast] = useState(false);

  // End Session Dialog State
  const [isEndDialogOpen, setIsEndDialogOpen] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  // Preferences for hide pill on session end
  const { hidePillOnSessionEnd, dontAskHidePillAgain, updatePreference } = usePreferences();

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
      const response = await fetch(
        `${API_BASE_URL}/api/integrations/linear/status`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
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

  // Replaced handleEndSession with EndSessionDialog trigger
  const handleEndButtonClick = () => {
    setIsEndDialogOpen(true);
  };

  // Confirm handler for the dialog
  const handleConfirmEndSession = async (preferences: {
    style: "verbose" | "concise";
    format: "bullets" | "paragraphs";
    includeScreenshots: boolean;
  }) => {
    if (!sessionId) return;

    setIsEnding(true);
    try {
      // 1. Stop Electron capture
      const electronResult = await window.consoleAPI.stopMonitoringSession();

      // If Electron session is already ended (e.g., from pill), that's OK
      if (electronResult.error && electronResult.error !== "No active session") {
        throw new Error(electronResult.error);
      }

      // 2. Upload captures if any
      if (electronResult.captures && electronResult.captures.length > 0) {
        await uploadCaptures(sessionId, electronResult.captures);
      }

      // 3. Trigger backend end + summary generation with preferences
      await endSessionMutation.mutateAsync({
        sessionId,
        preferences // Pass preferences to backend
      });

      setIsEndDialogOpen(false);

      // Handle pill hiding logic
      if (hidePillOnSessionEnd || dontAskHidePillAgain) {
        window.consoleAPI.hidePill();
      } else {
        setShowSessionEndToast(true);
      }

      toast({
        title: "Session Ended",
        description: "Generating your master story...",
      });

    } catch (error) {
      logger.error("Error ending session:", error);
      toast({
        title: "Error",
        description: "Failed to end session properly.",
        variant: "destructive",
      });
    } finally {
      setIsEnding(false);
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
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="animate-spin text-text-secondary" size={32} />
      </div>
    );
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

  const summary = summaryData?.finalSummary || summaryData?.rawSummary || "";
  const isDelivered = session.deliveryStatus === "delivered";

  // AI Edit Mode - full screen split-pane editor
  if (isAIEditMode && summary) {
    return (
      <AIEditPanel
        title="Edit Summary"
        subtitle={session.name || "Work Session"}
        initialContent={summary}
        onSave={handleSaveSummary}
        onCancel={() => setIsAIEditMode(false)}
        onRevise={handleRevise}
        placeholder="Edit your session summary..."
        contextLabel="session summary"
      />
    );
  }

  return (
    <div className="p-8 space-y-6 app-no-drag">
      {/* Header */}
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
            <h1 className="text-3xl font-bold text-text-primary">
              {session.name === "Work session" && session.status === "summarizing" ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="animate-spin" size={24} />
                  Generating title...
                </span>
              ) : (
                session.name || "Untitled Session"
              )}
            </h1>
            <p className="text-text-secondary mt-1">{formatDateTime(session.startedAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session.status === "active" && (
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
                onClick={handleEndButtonClick}
                disabled={isEnding}
                className="gap-2 bg-status-error text-white hover:bg-status-error/90"
              >
                {isEnding ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Square size={16} />
                )}
                End Session
              </Button>
            </>
          )}
          {session.status === "paused" && (
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
                onClick={handleEndButtonClick}
                disabled={isEnding}
                variant="outline"
                className="gap-2 border-status-error text-status-error hover:bg-status-error/10"
              >
                {isEnding ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Square size={16} />
                )}
                End Session
              </Button>
            </>
          )}
          {session.status !== "active" &&
            session.status !== "paused" &&
            (isDelivered ? (
              <div className="flex items-center gap-2">
                <Badge className="bg-status-success/20 text-status-success border-transparent">
                  <CheckCircle size={14} className="mr-1" />
                  Delivered
                </Badge>
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
            className="text-status-error hover:text-status-error hover:bg-status-error/10"
          >
            <Trash2 size={18} />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm border-b border-border-subtle pb-6">
        <div className="flex items-center gap-2 text-text-secondary">
          <Clock size={18} />
          <span>
            Duration:{" "}
            <span className="text-text-primary font-medium">
              {session.endedAt
                ? formatDuration(
                  new Date(session.startedAt),
                  new Date(session.endedAt),
                  session.totalPausedMs
                )
                : "In progress"}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-text-secondary">
          <Camera size={18} />
          <span>
            Captures:{" "}
            <span className="text-text-primary font-medium">{session.captureCount ?? 0}</span>
          </span>
        </div>
        {session.deliveredAt && (
          <div className="flex items-center gap-2 text-text-secondary">
            <Send size={18} />
            <span>
              Delivered:{" "}
              <span className="text-text-primary font-medium">
                {formatDateTime(session.deliveredAt)}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Progressive Story Section - Shows during active/paused sessions */}
      {storyData?.story && (session?.status === "active" || session?.status === "paused") && (
        <div className="space-y-3">
          <button
            onClick={() => setIsStoryExpanded(!isStoryExpanded)}
            className="flex items-center gap-2 w-full text-left group"
          >
            <BookOpen size={18} className="text-primary" />
            <h2 className="text-lg font-semibold text-text-primary flex-1">Live Progress Story</h2>
            <Badge variant="secondary" className="text-xs">
              v{storyData.metadata?.version || 0}
            </Badge>
            {isStoryExpanded ? (
              <ChevronUp size={18} className="text-text-secondary group-hover:text-text-primary" />
            ) : (
              <ChevronDown
                size={18}
                className="text-text-secondary group-hover:text-text-primary"
              />
            )}
          </button>

          {isStoryExpanded && (
            <div className="bg-background-elevated rounded-lg border border-primary/20 p-4">
              <div className="prose prose-invert prose-sm max-w-none">
                {storyData.story.split("\n").map((paragraph, i) => (
                  <p key={i} className="text-text-primary mb-2 last:mb-0 text-sm leading-relaxed">
                    {paragraph || <br />}
                  </p>
                ))}
              </div>
              {storyData.metadata?.lastUpdated && (
                <div className="mt-3 pt-2 border-t border-border-subtle text-xs text-text-tertiary">
                  Last updated: {new Date(storyData.metadata.lastUpdated).toLocaleTimeString()}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Summary Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-text-primary">Session Summary</h2>
          <div className="flex items-center gap-2">
            {/* DEV ONLY: Regenerate button - hidden in production */}
            {import.meta.env.DEV && session.status === "ready" && (
              <Button
                variant="ghost"
                onClick={async () => {
                  try {
                    const { regenerateSummary } =
                      await import("@/console/src/services/monitoringService");
                    await regenerateSummary(sessionId!);
                    toast({
                      title: "Regenerating summary...",
                      description: "This may take a few seconds.",
                      duration: 3000,
                    });
                    queryClient.invalidateQueries({ queryKey: monitoringKeys.session(sessionId!) });
                  } catch (err) {
                    toast({
                      title: "Error",
                      description: "Failed to regenerate",
                      variant: "destructive",
                    });
                  }
                }}
                className="gap-2 text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
              >
                <RefreshCw size={16} />
                Regenerate (Dev)
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
          <div className="bg-background-elevated rounded-lg border border-border-subtle p-6">
            <div className="prose prose-invert prose-sm max-w-none">
              {summary.split("\n").map((paragraph, i) => (
                <p key={i} className="text-text-primary mb-3 last:mb-0">
                  {paragraph || <br />}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-background-elevated rounded-lg border border-border-subtle p-8 text-center">
            <p className="text-text-secondary">
              {session.status === "summarizing"
                ? "Generating summary..."
                : "No summary available for this session."}
            </p>
          </div>
        )}
      </div>

      {/* Key Activities (if available) */}
      {session.keyActivities &&
        Array.isArray(session.keyActivities) &&
        session.keyActivities.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">Key Activities</h2>
            <ul className="space-y-2">
              {session.keyActivities.map((activity: any, i: number) => (
                <li
                  key={i}
                  className="flex items-start gap-3 p-3 bg-background-elevated rounded-lg border border-border-subtle"
                >
                  <CheckCircle size={18} className="text-status-success mt-0.5 flex-shrink-0" />
                  <span className="text-text-primary">
                    {typeof activity === "string"
                      ? activity
                      : activity.activity || activity.description || JSON.stringify(activity)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

      {/* Activity Timeline */}
      <ActivityTimeline sessionId={sessionId || ""} />

      {/* Top-K Frames Gallery - Shows after session ends */}
      {session.topKFrames && session.topKFrames.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Image size={18} className="text-primary" />
            <h2 className="text-xl font-semibold text-text-primary">
              Key Frames ({session.topKFrames.length})
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {session.topKFrames.map((frame: any) => (
              <div
                key={frame.id}
                className="group relative bg-background-elevated rounded-lg border border-border-subtle overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedFrame(frame.id)}
              >
                {frame.imageData ? (
                  <img
                    src={`data:image/png;base64,${frame.imageData}`}
                    alt={frame.activityDescription || "Session capture"}
                    className="w-full aspect-video object-cover"
                  />
                ) : (
                  <div className="w-full aspect-video bg-background-tertiary flex items-center justify-center">
                    <Camera size={24} className="text-text-tertiary" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-white text-xs line-clamp-2">
                    {frame.activityDescription || frame.appName || "Captured frame"}
                  </p>
                  <p className="text-white/60 text-xs mt-1">
                    {new Date(frame.capturedAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Frame Preview Dialog */}
      <Dialog open={!!selectedFrame} onOpenChange={() => setSelectedFrame(null)}>
        <DialogContent className="bg-background-primary border-border-subtle max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Frame Preview</DialogTitle>
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
                      className="w-full rounded-lg"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-background-tertiary flex items-center justify-center rounded-lg">
                      <Camera size={48} className="text-text-tertiary" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-text-primary">
                      {frame.activityDescription || "No description available"}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-text-secondary">
                      <span>{frame.appName || "Unknown app"}</span>
                      <span>•</span>
                      <span>{new Date(frame.capturedAt).toLocaleString()}</span>
                      {frame.importanceScore && (
                        <>
                          <span>•</span>
                          <Badge variant="secondary">
                            Importance: {(frame.importanceScore * 100).toFixed(0)}%
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>

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

      {/* End Session Dialog */}
      <EndSessionDialog
        open={isEndDialogOpen}
        onOpenChange={setIsEndDialogOpen}
        onConfirm={handleConfirmEndSession}
        isProcessing={isEnding}
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
