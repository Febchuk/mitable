import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SelectedWindowsList from "./SelectedWindowsList";
import { useSessions } from "@/console/src/context/SessionsContext";
import type { SelectedWindowInfo } from "@mitable/shared";

export default function NewSession() {
  const navigate = useNavigate();
  const { createSession } = useSessions();
  const [selectedWindows, setSelectedWindows] = useState<SelectedWindowInfo[]>([]);
  const [isSelecting, setIsSelecting] = useState(false);

  // Load initial selected windows
  useEffect(() => {
    const loadWindows = async () => {
      try {
        const windows = await window.consoleAPI?.getSelectedWindows();
        if (windows) {
          setSelectedWindows(windows);
        }
      } catch (error) {
        console.error("Failed to load selected windows:", error);
      }
    };
    loadWindows();
  }, []);

  // Listen for watch window updates
  useEffect(() => {
    if (!window.consoleAPI?.onWatchWindowsUpdated) return;

    const cleanup = window.consoleAPI.onWatchWindowsUpdated((windows) => {
      console.log("[NewSession] Watch windows updated:", windows);
      setSelectedWindows(windows);
    });

    return cleanup;
  }, []);

  const handleStartSelecting = async () => {
    try {
      await window.consoleAPI?.toggleWatchMode(true);
      setIsSelecting(true);
    } catch (error) {
      console.error("Failed to start watch mode:", error);
    }
  };

  const handleRemoveWindow = async (windowId: string) => {
    try {
      await window.consoleAPI?.unselectWindow(windowId);
      // State will be updated via onWatchWindowsUpdated
    } catch (error) {
      console.error("Failed to remove window:", error);
    }
  };

  const handleDone = () => {
    if (selectedWindows.length === 0) return;

    // Turn off watch mode (buttons will disappear)
    window.consoleAPI?.toggleWatchMode(false);

    // Create session
    const session = createSession(selectedWindows);

    // Show watching pill window
    window.consoleAPI?.showWatchingPill();

    // Navigate to session detail
    navigate(`/sessions/${session.id}`);
  };

  const handleCancel = () => {
    // Turn off watch mode if it was started
    if (isSelecting) {
      window.consoleAPI?.toggleWatchMode(false);
    }
    navigate("/sessions");
  };

  return (
    <Dialog open={true} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[600px] bg-[#2A2A2A] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Select windows to watch</DialogTitle>
          <DialogDescription className="text-white/70">
            Choose which windows Mitable should observe during this session. Click
            "Start Selecting Windows" to see selection buttons on your open windows.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Start Selecting Button */}
          {!isSelecting && (
            <Button
              onClick={handleStartSelecting}
              className="w-full bg-gradient-purple text-white hover:shadow-glow-purple"
            >
              Start Selecting Windows
            </Button>
          )}

          {/* Selected Windows Display */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">
                Selected Windows
              </span>
              {selectedWindows.length > 0 && (
                <span className="text-xs text-white/60">
                  {selectedWindows.length} window{selectedWindows.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="min-h-[60px] p-3 bg-[#1A1A1A] rounded-lg border border-white/10">
              <SelectedWindowsList
                windows={selectedWindows}
                onRemoveWindow={handleRemoveWindow}
                showRemoveButton={isSelecting}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <Button
            variant="ghost"
            onClick={handleCancel}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            Cancel
          </Button>
          <Button
            onClick={handleDone}
            disabled={selectedWindows.length === 0}
            className="bg-gradient-purple text-white hover:shadow-glow-purple disabled:opacity-50"
          >
            Done Selecting Windows
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

