/**
 * LinearUpdateDialog
 *
 * Dialog for sending session updates to a Linear ticket.
 * Allows selecting a ticket, optionally changing status, and previewing the update.
 */

import { useState, useEffect } from "react";
import { createLogger } from "../../../../../../lib/logger";

const logger = createLogger("LinearUpdateDialog");

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { authService } from "@/console/src/services/authService";
import { Loader2, Search, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SiLinear } from "react-icons/si";
import { API_BASE_URL } from "@/console/src/lib/config";
const LINEAR_APP_NAME = import.meta.env.VITE_LINEAR_APP_NAME || "Mitable-dev";

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state: {
    id: string;
    name: string;
    color: string;
  };
  team: {
    id: string;
    name: string;
    key: string;
  };
}

interface LinearTeam {
  id: string;
  name: string;
  key: string;
  states: Array<{
    id: string;
    name: string;
    color: string;
    type: string;
  }>;
}

interface LinearUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  sessionName: string;
  summary: string;
  onSuccess?: () => void;
}

export default function LinearUpdateDialog({
  open,
  onOpenChange,
  sessionId,
  sessionName,
  summary,
  onSuccess,
}: LinearUpdateDialogProps) {
  const { toast } = useToast();

  const [issues, setIssues] = useState<LinearIssue[]>([]);
  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const [selectedIssueId, setSelectedIssueId] = useState<string>("");
  const [changeStatus, setChangeStatus] = useState(false);
  const [selectedStateId, setSelectedStateId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  // Get the selected issue
  const selectedIssue = issues.find((i) => i.id === selectedIssueId);

  // Get the team for the selected issue
  const selectedTeam = selectedIssue ? teams.find((t) => t.id === selectedIssue.team.id) : null;

  // Filter issues by search query
  const filteredIssues = issues.filter(
    (issue) =>
      issue.identifier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (open) {
      loadIssues();
      loadTeams();
    }
  }, [open]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedIssueId("");
      setChangeStatus(false);
      setSelectedStateId("");
      setSearchQuery("");
    }
  }, [open]);

  const loadIssues = async () => {
    setIsLoadingIssues(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/integrations/linear/issues`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setIssues(data.issues || []);
      }
    } catch (error) {
      logger.error("Error loading issues:", error);
    } finally {
      setIsLoadingIssues(false);
    }
  };

  const loadTeams = async () => {
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/integrations/linear/teams`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setTeams(data.teams || []);
      }
    } catch (error) {
      logger.error("Error loading teams:", error);
    }
  };

  const handleSend = async () => {
    if (!selectedIssueId) return;

    setIsSending(true);
    try {
      const token = authService.getAccessToken();
      if (!token) {
        toast({
          title: "Error",
          description: "Not authenticated",
          variant: "destructive",
        });
        return;
      }

      // Format the comment body with attribution
      const commentBody = `## Session Update: ${sessionName}\n\n${summary}\n\n---\n*via ${LINEAR_APP_NAME}*`;

      // Create comment on the issue
      const commentResponse = await fetch(
        `${API_BASE_URL}/api/integrations/linear/issues/${selectedIssueId}/comment`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ body: commentBody }),
        }
      );

      if (!commentResponse.ok) {
        throw new Error("Failed to create comment");
      }

      // Update status if requested
      if (changeStatus && selectedStateId) {
        const stateResponse = await fetch(
          `${API_BASE_URL}/api/integrations/linear/issues/${selectedIssueId}/state`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ stateId: selectedStateId }),
          }
        );

        if (!stateResponse.ok) {
          toast({
            title: "Partial Success",
            description: "Comment added but status update failed",
            variant: "destructive",
          });
          onOpenChange(false);
          onSuccess?.();
          return;
        }
      }

      // Mark session as delivered
      await fetch(`${API_BASE_URL}/api/monitoring/sessions/${sessionId}/mark-delivered`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      toast({
        title: "Sent to Linear",
        description: `Update posted to ${selectedIssue?.identifier}${changeStatus ? " and status updated" : ""}`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      logger.error("Error sending to Linear:", error);
      toast({
        title: "Failed to Send",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] bg-background-primary border-border-subtle">
        <DialogHeader className="pr-10">
          <DialogTitle className="flex items-center gap-2 text-text-primary">
            <div className="w-6 h-6 bg-[#5E6AD2] rounded flex items-center justify-center">
              <SiLinear className="w-3.5 h-3.5 text-white" />
            </div>
            Send to Linear
          </DialogTitle>
          <DialogDescription className="text-text-secondary whitespace-normal break-words">
            Post this session summary as an update to a Linear ticket.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Issue Selector */}
          <div className="space-y-2">
            <Label className="text-text-primary">Select Ticket</Label>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search tickets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-background-elevated border-border-subtle text-text-primary"
              />
            </div>

            {/* Issues List */}
            <div className="max-h-[220px] overflow-y-auto space-y-1 rounded-lg border border-border-subtle p-2 bg-background-primary">
              {isLoadingIssues ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredIssues.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  {searchQuery ? "No matching tickets" : "No assigned tickets found"}
                </div>
              ) : (
                filteredIssues.map((issue) => (
                  <button
                    key={issue.id}
                    onClick={() => setSelectedIssueId(issue.id)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedIssueId === issue.id
                        ? "bg-[#5E6AD2]/20 border border-[#5E6AD2]"
                        : "hover:bg-background-elevated border border-transparent"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                        style={{ backgroundColor: issue.state.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-mono">
                            {issue.identifier}
                          </span>
                          <span
                            className="text-xs px-1.5 py-0.5 rounded text-white"
                            style={{ backgroundColor: issue.state.color }}
                          >
                            {issue.state.name}
                          </span>
                        </div>
                        <p className="text-sm text-text-primary truncate">{issue.title}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {selectedIssue && (
              <a
                href={selectedIssue.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                View in Linear <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Status Change Option */}
          {selectedIssue && selectedTeam && (
            <div className="space-y-3 pt-2 border-t border-border-subtle">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="change-status"
                  checked={changeStatus}
                  onCheckedChange={(checked) => {
                    setChangeStatus(checked === true);
                    if (!checked) setSelectedStateId("");
                  }}
                />
                <Label htmlFor="change-status" className="text-text-primary cursor-pointer">
                  Also update ticket status
                </Label>
              </div>

              {changeStatus && (
                <Select value={selectedStateId} onValueChange={setSelectedStateId}>
                  <SelectTrigger className="bg-background-elevated border-border-subtle text-text-primary">
                    <SelectValue placeholder="Select new status..." />
                  </SelectTrigger>
                  <SelectContent className="bg-background-elevated border-border-subtle">
                    {selectedTeam.states.map((state) => (
                      <SelectItem key={state.id} value={state.id} className="text-text-primary">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: state.color }}
                          />
                          {state.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Preview */}
          <div className="space-y-2 pt-2 border-t border-border-subtle">
            <Label className="text-text-primary">Preview</Label>
            <div className="p-3 rounded-lg bg-background-elevated border border-border-subtle text-sm">
              <p className="text-text-primary font-medium mb-2">Session Update: {sessionName}</p>
              <p className="text-text-secondary text-xs line-clamp-3">{summary}</p>
              <p className="text-muted-foreground text-xs mt-2 italic">via {LINEAR_APP_NAME}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-white hover:bg-transparent"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!selectedIssueId || isSending || (changeStatus && !selectedStateId)}
            className="bg-[#5E6AD2] hover:bg-[#4F5ABF] text-white gap-2"
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <SiLinear className="w-4 h-4" />
                Send Update
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
