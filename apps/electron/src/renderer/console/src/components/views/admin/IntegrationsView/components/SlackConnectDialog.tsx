/**
 * @deprecated Integrations tab no longer in use. Local-first app does not use
 * cloud integrations. This file is scheduled for deletion.
 */
import { useState } from "react";
import { createLogger } from "../../../../../../../lib/logger";

const logger = createLogger("SlackConnectDialog");
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, MessageSquare, FileText } from "lucide-react";
import { authService } from "@/console/src/services/authService";
import { API_BASE_URL } from "@/console/src/lib/config";

interface SlackConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: () => void;
}

export default function SlackConnectDialog({
  open,
  onOpenChange,
  onConnect,
}: SlackConnectDialogProps) {
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

      const response = await fetch(`${API_BASE_URL}/api/integrations/slack/oauth/start`, {
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
      logger.error("Error starting Slack OAuth:", err);
      setError(err instanceof Error ? err.message : "Failed to connect to Slack");
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-background-elevated border-border-subtle">
        <DialogHeader>
          <DialogTitle className="text-2xl text-text-primary">Connect Slack Workspace</DialogTitle>
          <DialogDescription className="text-text-secondary">
            Connect your Slack workspace to Mitable for AI-powered knowledge retrieval. You'll be
            redirected to Slack to authorize access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* What Happens Section */}
          <div className="bg-background-secondary rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare size={20} className="text-primary" />
              <h3 className="font-semibold text-text-primary">What Happens Next:</h3>
            </div>
            <ol className="space-y-2 text-sm text-text-secondary ml-7 list-decimal list-inside">
              <li>You'll be redirected to Slack to authorize Mitable</li>
              <li>Select your Slack workspace from the dropdown</li>
              <li>Review the permissions and click "Allow"</li>
              <li>The Mitable bot will be installed in your workspace</li>
              <li>You'll return here to select which channels to sync</li>
            </ol>
          </div>

          {/* Permissions Section */}
          <div className="bg-background-secondary rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText size={20} className="text-primary" />
              <h3 className="font-semibold text-text-primary">Required Permissions:</h3>
            </div>
            <ul className="space-y-2 text-sm text-text-secondary ml-7">
              <li>
                • <strong>channels:read, channels:history</strong> - Read public channel messages
              </li>
              <li>
                • <strong>groups:read, groups:history</strong> - Read private channel messages
              </li>
              <li>
                • <strong>users:read</strong> - Get user information for attribution
              </li>
            </ul>
          </div>

          {/* Important Note */}
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
            <p className="text-sm text-text-secondary">
              <strong className="text-text-primary">Important:</strong> After connecting, you'll
              need to invite the Mitable bot to specific channels using{" "}
              <code className="font-mono text-xs bg-background-primary px-2 py-1 rounded text-text-primary">
                /invite @Mitable
              </code>{" "}
              in Slack. Only invited channels will be accessible.
            </p>
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
            className="bg-primary hover:bg-primary/90 text-white gap-2"
          >
            {isConnecting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Opening Slack...
              </>
            ) : (
              <>
                Connect to Slack
                <ArrowRight size={16} />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
