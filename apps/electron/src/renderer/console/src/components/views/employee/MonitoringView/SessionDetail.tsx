/**
 * SessionDetail
 *
 * Detailed view of a monitoring session.
 * Shows summary, allows editing, and provides delivery options.
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useSession,
  useSessionSummary,
  useUpdateSummary,
  useDeliverSummary,
  useDeleteSession,
  useEndSession,
  useSlackChannels,
} from "@/console/src/hooks/queries/monitoring";
import { uploadCaptures } from "@/console/src/services/monitoringService";
import {
  ArrowLeft,
  Clock,
  Camera,
  Edit2,
  Save,
  Send,
  Trash2,
  CheckCircle,
  Loader2,
  X,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

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

  const updateSummaryMutation = useUpdateSummary();
  const deliverSummaryMutation = useDeliverSummary();
  const deleteSessionMutation = useDeleteSession();
  const endSessionMutation = useEndSession();

  const [isEditing, setIsEditing] = useState(false);
  const [editedSummary, setEditedSummary] = useState("");
  const [isDeliveryDialogOpen, setIsDeliveryDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string>("");

  // Initialize edited summary when data loads
  useEffect(() => {
    if (summaryData) {
      setEditedSummary(summaryData.finalSummary || summaryData.rawSummary || "");
    }
  }, [summaryData]);

  const handleSaveSummary = async () => {
    if (!sessionId) return;

    try {
      await updateSummaryMutation.mutateAsync({
        sessionId,
        summary: editedSummary,
      });
      setIsEditing(false);
      toast({
        title: "Summary saved",
        description: "Your changes have been saved successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save summary. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeliverSummary = async () => {
    if (!sessionId || !selectedChannel) return;

    const channel = slackChannels.find((c) => c.id === selectedChannel);

    try {
      await deliverSummaryMutation.mutateAsync({
        sessionId,
        channelId: selectedChannel,
        channelName: channel?.name,
      });
      setIsDeliveryDialogOpen(false);
      toast({
        title: "Summary delivered",
        description: `Summary has been sent to #${channel?.name || selectedChannel}`,
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
        console.log(`[SessionDetail] Uploading ${electronResult.captures.length} captures to backend`);
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
          {session.status === "active" || session.status === "paused" ? (
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
          ) : isDelivered ? (
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
          )}
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
            Captures: <span className="text-text-primary font-medium">N/A</span>
          </span>
        </div>
        {session.deliveredAt && (
          <div className="flex items-center gap-2 text-text-secondary">
            <Send size={18} />
            <span>
              Delivered: <span className="text-text-primary font-medium">{formatDateTime(session.deliveredAt)}</span>
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
              onClick={() => {
                if (isEditing) {
                  handleSaveSummary();
                } else {
                  setIsEditing(true);
                }
              }}
              disabled={updateSummaryMutation.isPending}
              className="gap-2 text-text-secondary hover:text-text-primary"
            >
              {updateSummaryMutation.isPending ? (
                <Loader2 className="animate-spin" size={16} />
              ) : isEditing ? (
                <>
                  <Save size={16} />
                  Save
                </>
              ) : (
                <>
                  <Edit2 size={16} />
                  Edit
                </>
              )}
            </Button>
          )}
        </div>

        {summary ? (
          isEditing ? (
            <div className="space-y-4">
              <Textarea
                value={editedSummary}
                onChange={(e) => setEditedSummary(e.target.value)}
                className="min-h-[300px] bg-background-elevated border-border-subtle text-text-primary font-mono text-sm"
                placeholder="Edit your session summary..."
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsEditing(false);
                    setEditedSummary(summary);
                  }}
                  className="gap-2"
                >
                  <X size={16} />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-background-elevated rounded-lg border border-border-subtle p-6">
              <div className="prose prose-invert prose-sm max-w-none">
                {summary.split("\n").map((paragraph, i) => (
                  <p key={i} className="text-text-primary mb-3 last:mb-0">
                    {paragraph || <br />}
                  </p>
                ))}
              </div>
            </div>
          )
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
      {session.keyActivities && Array.isArray(session.keyActivities) && session.keyActivities.length > 0 && (
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
                  {typeof activity === "string" ? activity : activity.description || JSON.stringify(activity)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Delivery Dialog */}
      <Dialog open={isDeliveryDialogOpen} onOpenChange={setIsDeliveryDialogOpen}>
        <DialogContent className="bg-background-primary border-border-subtle">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Send to Slack</DialogTitle>
            <DialogDescription className="text-text-secondary">
              Choose a Slack channel to share your session summary.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <label className="block text-sm font-medium text-text-primary mb-2">Channel</label>
            {isLoadingChannels ? (
              <div className="flex items-center gap-2 text-text-secondary">
                <Loader2 className="animate-spin" size={16} />
                Loading channels...
              </div>
            ) : slackChannels.length === 0 ? (
              <p className="text-text-secondary text-sm">
                No Slack channels available. Please configure Slack integration first.
              </p>
            ) : (
              <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                <SelectTrigger className="bg-background-elevated border-border-subtle text-text-primary">
                  <SelectValue placeholder="Select a channel" />
                </SelectTrigger>
                <SelectContent>
                  {slackChannels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      #{channel.name}
                      {channel.is_private && " (private)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDeliveryDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDeliverSummary}
              disabled={!selectedChannel || deliverSummaryMutation.isPending}
              className="bg-primary text-white hover:bg-primary/90"
            >
              {deliverSummaryMutation.isPending ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={16} />
                  Sending...
                </>
              ) : (
                "Send"
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
