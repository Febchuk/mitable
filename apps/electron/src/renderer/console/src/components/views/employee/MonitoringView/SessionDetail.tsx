/**
 * SessionDetail
 *
 * Detailed view of a monitoring session.
 * Shows summary, allows editing, and provides delivery options.
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useSession,
  useSessionSummary,
  useUpdateSummary,
  useDeliverSummary,
  useDeleteSession,
  useEndSession,
  useSlackChannels,
  useSlackUsers,
  useReviseSummary,
  useUpdateSession,
} from "@/console/src/hooks/queries/monitoring";
import { uploadCaptures } from "@/console/src/services/monitoringService";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  const updateSummaryMutation = useUpdateSummary();
  const deliverSummaryMutation = useDeliverSummary();
  const deleteSessionMutation = useDeleteSession();
  const endSessionMutation = useEndSession();
  const reviseSummaryMutation = useReviseSummary();
  const updateSessionMutation = useUpdateSession();

  const [isAIEditMode, setIsAIEditMode] = useState(false);
  const [isPauseLoading, setIsPauseLoading] = useState(false);
  const [isDeliveryDialogOpen, setIsDeliveryDialogOpen] = useState(false);
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

  const handleEndSession = async () => {
    if (!sessionId) return;

    try {
      // 1. End Electron-side capture loop and get captures
      const electronResult = await window.consoleAPI.endMonitoringSession();

      if (electronResult.error) {
        throw new Error(electronResult.error);
      }

      // 2. Upload captures to backend (so summarization can use them)
      if (electronResult.captures && electronResult.captures.length > 0) {
        console.log(
          `[SessionDetail] Uploading ${electronResult.captures.length} captures to backend`
        );
        await uploadCaptures(sessionId, electronResult.captures);
      } else {
        console.log("[SessionDetail] No captures to upload");
      }

      // 3. Trigger backend summarization
      await endSessionMutation.mutateAsync(sessionId);

      toast({
        title: "Session ended",
        description: "Summary is being generated...",
      });
    } catch (error) {
      console.error("[SessionDetail] Error ending session:", error);
      toast({
        title: "Error",
        description: "Failed to end session. Please try again.",
        variant: "destructive",
      });
    }
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
      console.error("[SessionDetail] Error pausing session:", error);
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
      console.error("[SessionDetail] Error resuming session:", error);
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
            className="text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-text-primary">
              {session.name || "Work Session"}
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
                onClick={handleEndSession}
                disabled={endSessionMutation.isPending}
                className="gap-2 bg-status-error text-white hover:bg-status-error/90"
              >
                {endSessionMutation.isPending ? (
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
                onClick={handleEndSession}
                disabled={endSessionMutation.isPending}
                variant="outline"
                className="gap-2 border-status-error text-status-error hover:bg-status-error/10"
              >
                {endSessionMutation.isPending ? (
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
              <Badge className="bg-status-success/20 text-status-success border-transparent">
                <CheckCircle size={14} className="mr-1" />
                Delivered
              </Badge>
            ) : (
              <Button
                onClick={() => setIsDeliveryDialogOpen(true)}
                disabled={!summary}
                className="gap-2 bg-primary text-white hover:bg-primary/90"
              >
                <Send size={16} />
                Send to Slack
              </Button>
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

      {/* Summary Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-text-primary">Session Summary</h2>
          {!isDelivered && summary && (
            <Button
              variant="ghost"
              onClick={() => setIsAIEditMode(true)}
              className="gap-2 text-text-secondary hover:text-text-primary"
            >
              <Edit2 size={16} />
              Edit
            </Button>
          )}
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
