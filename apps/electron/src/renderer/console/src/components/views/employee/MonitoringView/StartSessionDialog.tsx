/**
 * StartSessionDialog
 *
 * Modified to be simpler: "Start Working" button essentially.
 * Session setup happens automatically in the background or with minimal inputs.
 *
 * NOTE: For "Instant Start", we can remove most of this UI and just trigger it,
 * but keeping window selection is usually critical for privacy/functionality.
 * If "Instant" means "Monitor Everything", we can bypass this dialog.
 *
 * Assuming we still want Window Selection (critical for privacy):
 * We will keep this dialog but streamline it.
 */

import { useState, useEffect } from "react";
import { useUser } from "@/console/src/context/UserContext";
import { createLogger } from "../../../../../../lib/logger";

const logger = createLogger("StartSessionDialog");
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Monitor, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import {
  startMonitoringSession,
  createSession,
  checkLinearConnection,
  type LinearIssue,
} from "@/console/src/services/monitoringService";
import type { SelectedWindowInfo } from "@mitable/shared";

interface StartSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DetectedWindow {
  windowId: string;
  appName: string;
  windowTitle: string;
  displayName: string;
  isBrowser: boolean;
  tabTitle?: string;
  thumbnail?: string;
}

export default function StartSessionDialog({ open, onOpenChange }: StartSessionDialogProps) {
  const { user } = useUser();
  const [selectedWindows, setSelectedWindows] = useState<string[]>([]);
  const [availableWindows, setAvailableWindows] = useState<DetectedWindow[]>([]);
  const [isLoadingWindows, setIsLoadingWindows] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Goal context state (Simplified - optional or removed for "Instant" feel)
  // We'll keep it simple: Just Windows + Go.
  
  // Load available windows when dialog opens
  useEffect(() => {
    if (open) {
      loadAvailableWindows();
    }
  }, [open]);

  const loadAvailableWindows = async () => {
    setIsLoadingWindows(true);
    try {
      const windows = await window.consoleAPI.getOpenWindows();
      const formatted = windows.map((w: any) => ({
        windowId: w.id.toString(),
        appName: w.ownerName,
        windowTitle: w.name,
        displayName: w.ownerName,
        isBrowser: ["Google Chrome", "Safari", "Firefox", "Arc"].includes(w.ownerName),
        tabTitle: w.name,
      }));
      setAvailableWindows(formatted);
      // Auto-select all by default for "Instant" feel? Or none?
      // Let's select all non-system apps by default to reduce clicks
      const initialSelection = formatted
        .filter((w: any) => !['Finder', 'Dock', 'Window Server'].includes(w.appName))
        .map((w: any) => w.windowId);
      setSelectedWindows(initialSelection);
    } catch (err) {
      logger.error("Failed to load windows:", err);
      setError("Failed to load open windows");
    } finally {
      setIsLoadingWindows(false);
    }
  };

  const handleWindowToggle = (windowId: string) => {
    setSelectedWindows((prev) =>
      prev.includes(windowId)
        ? prev.filter((id) => id !== windowId)
        : [...prev, windowId]
    );
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
                displayName: window.displayName,
                tabTitle: window.tabTitle,
                isBrowser: window.isBrowser,
              }
            : null;
        })
        .filter(Boolean) as SelectedWindowInfo[];

      // 1. Create session in backend
      const backendResult = await createSession({
        selectedWindows: windowsToMonitor,
        captureIntervalMs: 30000, // Fixed 30s interval
        name: "Work Session",
      });

      const backendSessionId = backendResult.session.id;

      // 2. Start Electron capture loop
      const electronResult = await startMonitoringSession({
        sessionId: backendSessionId,
        selectedWindows: windowsToMonitor,
        captureIntervalMs: 30000,
        name: "Work Session",
        userId: user.id,
        organizationId: user.organizationId,
      });

      if (electronResult.error) {
        setError(electronResult.error);
        setIsStarting(false);
        return;
      }

      onOpenChange(false);
    } catch (err) {
      logger.error("Failed to start session:", err);
      setError("Failed to start session. Please try again.");
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Start Work Session</DialogTitle>
          <DialogDescription>
            Select the windows you want to capture context from.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 min-h-[300px]">
          {isLoadingWindows ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {availableWindows.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No windows detected.
                </div>
              ) : (
                availableWindows.map((window) => (
                  <div
                    key={window.windowId}
                    className="flex items-center space-x-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <Checkbox
                      id={window.windowId}
                      checked={selectedWindows.includes(window.windowId)}
                      onCheckedChange={() => handleWindowToggle(window.windowId)}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label
                        htmlFor={window.windowId}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {window.appName}
                      </label>
                      <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                        {window.windowTitle}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
            {error}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => loadAvailableWindows()} disabled={isStarting}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingWindows ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={handleStartSession} disabled={isStarting || selectedWindows.length === 0}>
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Monitor className="w-4 h-4 mr-2" />
                Start Session
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
