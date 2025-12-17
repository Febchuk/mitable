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
import { Loader2, Monitor, RefreshCw } from "lucide-react";
import { startMonitoringSession } from "@/console/src/services/monitoringService";
import { createSession } from "@/console/src/services/monitoringService";
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

  // Load available windows when dialog opens
  useEffect(() => {
    if (open) {
      loadAvailableWindows();
    }
  }, [open]);

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
    } catch (err) {
      console.error("Error starting session:", err);
      setError("Failed to start session. Please try again.");
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-background-primary border-border-subtle">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Start Monitoring Session</DialogTitle>
          <DialogDescription className="text-text-secondary">
            Select the windows you want to monitor. We'll capture screenshots periodically to
            summarize your work.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
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

          {/* Window Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-text-primary">Windows to Monitor</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                  className="text-text-secondary hover:text-text-primary"
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
                  className="text-text-secondary hover:text-text-primary"
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
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {availableWindows.map((window) => (
                  <label
                    key={window.windowId}
                    className="flex items-center gap-3 p-3 rounded-lg bg-background-elevated hover:bg-background-elevated/80 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={selectedWindows.includes(window.windowId)}
                      onCheckedChange={() => handleWindowToggle(window.windowId)}
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isStarting}>
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
