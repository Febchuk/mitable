/**
 * StartSessionDialog
 *
 * Dialog for starting a new monitoring session.
 * Allows selecting windows to monitor and configuring capture settings.
 */

import { useState, useEffect } from "react";
import { useUser } from "@/console/src/context/UserContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Monitor, RefreshCw, Link2, ChevronDown, ChevronUp } from "lucide-react";
import {
  startMonitoringSession,
  createSession,
  fetchLinearIssues,
  checkLinearConnection,
  type LinearIssue,
} from "@/console/src/services/monitoringService";
import type { SelectedWindowInfo } from "@mitable/shared";
import { useQueryClient } from "@tanstack/react-query";
import { monitoringKeys } from "@/console/src/hooks/queries/monitoring";

interface StartSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DetectedWindow {
  windowId: string;
  appName: string;
  windowTitle: string;
  isVisible: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
}

export default function StartSessionDialog({ open, onOpenChange }: StartSessionDialogProps) {
  const { user } = useUser();
  const queryClient = useQueryClient();

  const [sessionName, setSessionName] = useState("");
  const [captureInterval, setCaptureInterval] = useState(30); // seconds
  const [selectedWindows, setSelectedWindows] = useState<string[]>([]);
  const [availableWindows, setAvailableWindows] = useState<DetectedWindow[]>([]);
  const [isLoadingWindows, setIsLoadingWindows] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Goal context state
  const [sessionGoal, setSessionGoal] = useState("");
  const [showLinearPicker, setShowLinearPicker] = useState(false);
  const [linearIssues, setLinearIssues] = useState<LinearIssue[]>([]);
  const [selectedLinearIssue, setSelectedLinearIssue] = useState<LinearIssue | null>(null);
  const [isLinearConnected, setIsLinearConnected] = useState(false);
  const [isLoadingLinear, setIsLoadingLinear] = useState(false);

  // Load available windows and check Linear connection when dialog opens
  useEffect(() => {
    if (open) {
      loadAvailableWindows();
      checkLinearStatus();
    }
  }, [open]);

  const checkLinearStatus = async () => {
    try {
      const connected = await checkLinearConnection();
      setIsLinearConnected(connected);
    } catch {
      setIsLinearConnected(false);
    }
  };

  const loadLinearIssues = async () => {
    if (linearIssues.length > 0) {
      // Already loaded
      setShowLinearPicker(true);
      return;
    }

    setIsLoadingLinear(true);
    try {
      const issues = await fetchLinearIssues();
      setLinearIssues(issues);
      setShowLinearPicker(true);
    } catch (err) {
      console.error("Failed to load Linear issues:", err);
    } finally {
      setIsLoadingLinear(false);
    }
  };

  const handleLinearIssueSelect = (issueId: string) => {
    const issue = linearIssues.find((i) => i.id === issueId);
    if (issue) {
      setSelectedLinearIssue(issue);
      // Pre-fill the goal with the issue title
      setSessionGoal(`[${issue.identifier}] ${issue.title}`);
    }
  };

  const loadAvailableWindows = async () => {
    setIsLoadingWindows(true);
    setError(null);

    try {
      // Use window detection service directly (not screenshot capture)
      const result = await window.consoleAPI.getVisibleWindows();

      if (result && result.success && result.windows) {
        // Convert WatchableWindow to DetectedWindow, excluding blocked windows
        const windows: DetectedWindow[] = result.windows
          .filter((w) => !w.isBlocked) // Exclude blocked windows
          .map((w) => ({
            windowId: w.windowId,
            appName: w.appName,
            windowTitle: w.windowTitle,
            isVisible: true,
            bounds: w.bounds,
          }));

        setAvailableWindows(windows);

        // Auto-select all windows by default
        setSelectedWindows(windows.map((w) => w.windowId));
      } else {
        setError(result?.error || "Failed to detect windows. Please try again.");
      }
    } catch (err) {
      console.error("Error loading windows:", err);
      setError("Failed to detect windows. Please try again.");
    } finally {
      setIsLoadingWindows(false);
    }
  };

  const handleWindowToggle = (windowId: string) => {
    setSelectedWindows((prev) =>
      prev.includes(windowId) ? prev.filter((id) => id !== windowId) : [...prev, windowId]
    );
  };

  const handleSelectAll = () => {
    if (selectedWindows.length === availableWindows.length) {
      setSelectedWindows([]);
    } else {
      setSelectedWindows(availableWindows.map((w) => w.windowId));
    }
  };

  const handleStartSession = async () => {
    if (!user?.id || !user?.organizationId) {
      setError("User information not available");
      return;
    }

    if (selectedWindows.length === 0) {
      setError("Please select at least one window to monitor");
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      // Prepare selected window info
      const windowsToMonitor: SelectedWindowInfo[] = selectedWindows
        .map((windowId) => {
          const window = availableWindows.find((w) => w.windowId === windowId);
          return window
            ? {
                windowId: window.windowId,
                appName: window.appName,
                windowTitle: window.windowTitle,
              }
            : null;
        })
        .filter(Boolean) as SelectedWindowInfo[];

      // 1. Create session in backend FIRST to get the session ID
      // This ensures Electron and backend use the SAME session ID
      const backendResult = await createSession({
        selectedWindows: windowsToMonitor,
        captureIntervalMs: captureInterval * 1000,
        name: sessionName || undefined,
        // Goal context fields
        sessionGoal: sessionGoal || undefined,
        linearIssueId: selectedLinearIssue?.identifier,
        linearIssueTitle: selectedLinearIssue?.title,
        linearIssueDescription: selectedLinearIssue?.description,
      });

      const backendSessionId = backendResult.session.id;

      // 2. Start Electron capture loop with the SAME session ID
      const electronResult = await startMonitoringSession({
        sessionId: backendSessionId, // Pass backend's ID to Electron
        selectedWindows: windowsToMonitor,
        captureIntervalMs: captureInterval * 1000,
        name: sessionName || undefined,
        userId: user.id,
        organizationId: user.organizationId,
      });

      if (electronResult.error) {
        setError(electronResult.error);
        setIsStarting(false);
        return;
      }

      // Invalidate queries and close dialog
      queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });

      onOpenChange(false);

      // Reset form
      setSessionName("");
      setCaptureInterval(30);
      setSelectedWindows([]);
      setSessionGoal("");
      setSelectedLinearIssue(null);
      setShowLinearPicker(false);
    } catch (err) {
      console.error("Error starting session:", err);
      setError("Failed to start session. Please try again.");
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-background-primary border-border-subtle overflow-hidden flex flex-col max-h-[85vh]">
        <DialogHeader className="pr-8 flex-shrink-0">
          <DialogTitle className="text-text-primary">Start Monitoring Session</DialogTitle>
          <DialogDescription className="text-text-secondary whitespace-normal break-words">
            Select the windows you want to monitor. We'll capture screenshots periodically to
            summarize your work.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 overflow-y-auto flex-1 px-4">
          {/* Session Name */}
          <div className="space-y-2">
            <Label htmlFor="session-name" className="text-text-primary">
              Session Name (optional)
            </Label>
            <Input
              id="session-name"
              placeholder="e.g., Bug Fix Session, Feature Development"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              className="bg-background-elevated border-border-subtle text-text-primary"
            />
          </div>

          {/* Capture Interval */}
          <div className="space-y-2">
            <Label htmlFor="capture-interval" className="text-text-primary">
              Capture Interval (seconds)
            </Label>
            <Input
              id="capture-interval"
              type="number"
              min={10}
              max={300}
              value={captureInterval}
              onChange={(e) => setCaptureInterval(parseInt(e.target.value) || 30)}
              className="bg-background-elevated border-border-subtle text-text-primary w-32"
            />
            <p className="text-text-tertiary text-sm">
              Screenshots will be captured every {captureInterval} seconds
            </p>
          </div>

          {/* Session Goal / Context */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="session-goal" className="text-text-primary">
                What are you working on? (optional)
              </Label>
              {isLinearConnected && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadLinearIssues}
                  disabled={isLoadingLinear}
                  className="text-text-secondary hover:text-text-primary hover:bg-background-elevated flex items-center gap-1.5"
                >
                  {isLoadingLinear ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Link2 size={14} />
                  )}
                  Link from Linear
                  {showLinearPicker ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </Button>
              )}
            </div>

            {/* Linear Issue Picker (shown if connected and expanded) */}
            {showLinearPicker && linearIssues.length > 0 && (
              <Select onValueChange={handleLinearIssueSelect}>
                <SelectTrigger className="bg-background-elevated border-border-subtle text-text-primary">
                  <SelectValue placeholder="Select a Linear issue..." />
                </SelectTrigger>
                <SelectContent className="bg-background-elevated border-border-subtle">
                  {linearIssues.map((issue) => (
                    <SelectItem
                      key={issue.id}
                      value={issue.id}
                      className="text-text-primary hover:bg-background-tertiary"
                    >
                      <span className="font-mono text-text-secondary mr-2">{issue.identifier}</span>
                      {issue.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {showLinearPicker && linearIssues.length === 0 && !isLoadingLinear && (
              <p className="text-text-tertiary text-sm">No assigned issues found</p>
            )}

            {/* Selected Linear Issue Badge */}
            {selectedLinearIssue && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-primary/10 border border-primary/20">
                <span className="font-mono text-primary text-sm">
                  {selectedLinearIssue.identifier}
                </span>
                <span className="text-text-primary text-sm truncate flex-1">
                  {selectedLinearIssue.title}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedLinearIssue(null);
                    setSessionGoal("");
                  }}
                  className="h-6 w-6 p-0 text-text-secondary hover:text-text-primary hover:bg-background-elevated"
                >
                  ×
                </Button>
              </div>
            )}

            {/* Goal Textarea */}
            <Textarea
              id="session-goal"
              placeholder="e.g., Fixing the payment timeout bug in checkout flow..."
              value={sessionGoal}
              onChange={(e) => setSessionGoal(e.target.value)}
              className="bg-background-elevated border-border-subtle text-text-primary min-h-[80px] resize-none"
            />
            <p className="text-text-tertiary text-sm">
              This helps the AI understand your work context and provide better summaries
            </p>
          </div>

          {/* Window Selection */}
          <div className="space-y-3 w-full">
            <div className="flex items-center justify-between">
              <Label className="text-text-primary">Windows to Monitor</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                  className="text-text-secondary hover:text-text-primary hover:bg-background-elevated"
                >
                  {selectedWindows.length === availableWindows.length
                    ? "Deselect All"
                    : "Select All"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadAvailableWindows}
                  disabled={isLoadingWindows}
                  className="text-text-secondary hover:text-text-primary hover:bg-background-elevated"
                >
                  <RefreshCw size={16} className={isLoadingWindows ? "animate-spin" : ""} />
                </Button>
              </div>
            </div>

            {isLoadingWindows ? (
              <div className="flex items-center justify-center py-8 text-text-secondary">
                <Loader2 className="animate-spin mr-2" size={20} />
                Detecting windows...
              </div>
            ) : availableWindows.length === 0 ? (
              <div className="text-center py-8 text-text-secondary">
                <Monitor size={32} className="mx-auto mb-2 opacity-50" />
                <p>No windows detected</p>
                <Button variant="link" onClick={loadAvailableWindows} className="text-primary mt-2">
                  Refresh
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                {availableWindows.map((window) => (
                  <label
                    key={window.windowId}
                    className="flex items-center gap-3 p-3 rounded-lg bg-background-elevated hover:bg-background-elevated/80 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={selectedWindows.includes(window.windowId)}
                      onCheckedChange={() => handleWindowToggle(window.windowId)}
                      className="flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-text-primary font-medium truncate">{window.appName}</p>
                      <p className="text-text-secondary text-sm truncate">{window.windowTitle}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-status-error/10 border border-status-error/20">
              <p className="text-status-error text-sm">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 pt-4">
          <Button
            onClick={() => onOpenChange(false)}
            disabled={isStarting}
            className="bg-background-elevated border border-border-subtle text-text-primary hover:bg-background-tertiary"
          >
            Cancel
          </Button>
          <Button
            onClick={handleStartSession}
            disabled={isStarting || selectedWindows.length === 0}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {isStarting ? (
              <>
                <Loader2 className="animate-spin mr-2" size={16} />
                Starting...
              </>
            ) : (
              "Start Session"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
