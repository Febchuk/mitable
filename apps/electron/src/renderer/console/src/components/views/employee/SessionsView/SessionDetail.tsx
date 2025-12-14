import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Eye, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import SelectedWindowsList from "./SelectedWindowsList";
import { useSessions } from "@/console/src/context/SessionsContext";
import type { SelectedWindowInfo } from "@mitable/shared";

export default function SessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { getSession } = useSessions();
  const session = sessionId ? getSession(sessionId) : undefined;
  const [selectedWindows, setSelectedWindows] = useState<SelectedWindowInfo[]>(
    session?.selectedWindows || []
  );

  // Load initial selected windows
  useEffect(() => {
    const loadWindows = async () => {
      if (session?.selectedWindows) {
        setSelectedWindows(session.selectedWindows);
      } else {
        try {
          const windows = await window.consoleAPI?.getSelectedWindows();
          if (windows) {
            setSelectedWindows(windows);
          }
        } catch (error) {
          console.error("Failed to load selected windows:", error);
        }
      }
    };
    loadWindows();
  }, [session]);

  // Listen for watch window updates
  useEffect(() => {
    if (!window.consoleAPI?.onWatchWindowsUpdated) return;

    const cleanup = window.consoleAPI.onWatchWindowsUpdated((windows) => {
      console.log("[SessionDetail] Watch windows updated:", windows);
      setSelectedWindows(windows);
    });

    return cleanup;
  }, []);

  const handleRemoveWindow = async (windowId: string) => {
    try {
      await window.consoleAPI?.unselectWindow(windowId);
      // State will be updated via onWatchWindowsUpdated
    } catch (error) {
      console.error("Failed to remove window:", error);
    }
  };

  if (!session) {
    return (
      <div className="p-8">
        <div className="text-center text-text-secondary">Session not found</div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-[calc(100vh-60px)] flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 flex-shrink-0 bg-background-secondary/50">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/sessions")}
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={18} />
            <span className="text-sm font-medium">Back to Sessions</span>
          </button>
        </div>
        <h1 className="text-xl font-bold text-text-primary mt-3">{session.name}</h1>
      </div>

      {/* Selected Windows Section */}
      <div className="px-6 py-4 flex-shrink-0 border-b border-border-subtle">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-text-primary">
            Watching {selectedWindows.length} window{selectedWindows.length !== 1 ? "s" : ""}
          </span>
        </div>
        <SelectedWindowsList
          windows={selectedWindows}
          onRemoveWindow={handleRemoveWindow}
          showRemoveButton={session.isActive}
        />
      </div>

      {/* Main Content Area - Blank for now */}
      <div className="flex-1 overflow-hidden bg-background-secondary/50"></div>

      {/* Footer with Purple Eye Icon */}
      <div className="px-6 py-4 flex-shrink-0 bg-background-secondary/50 border-t border-border-subtle">
        <div className="flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
            <Eye size={24} className="text-primary" />
          </div>
        </div>
      </div>
    </div>
  );
}

