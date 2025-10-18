import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, FileText, Lock } from "lucide-react";
import { authService } from "@/console/src/services/authService";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface NotionConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: () => void;
}

export default function NotionConnectDialog({
  open,
  onOpenChange,
  onConnect,
}: NotionConnectDialogProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      // Request OAuth URL from backend
      const token = authService.getAccessToken();
      if (!token) {
        throw new Error("Not authenticated. Please log in again.");
      }

      const response = await fetch(`${API_BASE_URL}/api/integrations/notion/oauth/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to start OAuth flow");
      }

      const { authUrl } = await response.json();

      // Open OAuth URL in system browser
      window.open(authUrl, "_blank");

      // Close dialog
      onOpenChange(false);

      // Call onConnect callback to trigger polling
      onConnect();
    } catch (err) {
      console.error("Error starting Notion OAuth:", err);
      setError(err instanceof Error ? err.message : "Failed to connect to Notion");
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-background-elevated border-border-subtle">
        <DialogHeader>
          <DialogTitle className="text-2xl text-text-primary">Connect Notion Workspace</DialogTitle>
          <DialogDescription className="text-text-secondary">
            Connect your Notion workspace to Mitable for AI-powered knowledge retrieval. You'll be
            redirected to Notion to authorize access and select pages.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* What Happens Section */}
          <div className="bg-background-secondary rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText size={20} className="text-indigo-500" />
              <h3 className="font-semibold text-text-primary">What Happens Next:</h3>
            </div>
            <ol className="space-y-2 text-sm text-text-secondary ml-7 list-decimal list-inside">
              <li>You'll be redirected to Notion to authorize Mitable</li>
              <li>Select your Notion workspace from the dropdown</li>
              <li>Choose which pages to share with Mitable</li>
              <li>Click "Allow access" to complete the connection</li>
              <li>Your selected pages will be synced automatically</li>
            </ol>
          </div>

          {/* What Gets Synced Section */}
          <div className="bg-background-secondary rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText size={20} className="text-indigo-500" />
              <h3 className="font-semibold text-text-primary">What Gets Synced:</h3>
            </div>
            <ul className="space-y-2 text-sm text-text-secondary ml-7">
              <li>
                • <strong>Page content</strong> - All blocks and text from shared pages
              </li>
              <li>
                • <strong>Nested pages</strong> - Child pages within shared parent pages
              </li>
              <li>
                • <strong>Database entries</strong> - Content from shared databases
              </li>
              <li>
                • <strong>Comments</strong> - Page comments (future feature)
              </li>
            </ul>
          </div>

          {/* Privacy Note */}
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Lock size={18} className="text-indigo-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-text-secondary">
                <strong className="text-text-primary">Privacy First:</strong> We only access pages
                you explicitly share during authorization. You can add or remove pages anytime by
                reconnecting.
              </p>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-text-secondary"
            disabled={isConnecting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConnect}
            disabled={isConnecting}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
          >
            {isConnecting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Opening Notion...
              </>
            ) : (
              <>
                Connect to Notion
                <ArrowRight size={16} />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
