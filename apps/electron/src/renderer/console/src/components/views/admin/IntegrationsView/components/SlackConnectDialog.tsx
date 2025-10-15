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
import { Input } from "@/components/ui/input";
import { ArrowRight, MessageSquare, FileText } from "lucide-react";

interface SlackConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (token: string) => void;
}

export default function SlackConnectDialog({
  open,
  onOpenChange,
  onConnect,
}: SlackConnectDialogProps) {
  const [botToken, setBotToken] = useState("");

  const handleConnect = () => {
    if (botToken.trim()) {
      onConnect(botToken.trim());
      setBotToken("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-background-elevated border-border-subtle">
        <DialogHeader>
          <DialogTitle className="text-2xl text-text-primary">Connect Slack Bot Token</DialogTitle>
          <DialogDescription className="text-text-secondary">
            Enter your Slack bot token to connect your workspace. Bot tokens provide secure, scoped
            access to only invited channels.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Why Bot Token Section */}
          <div className="bg-background-secondary rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare size={20} className="text-primary" />
              <h3 className="font-semibold text-text-primary">Why Bot Token?</h3>
            </div>
            <ul className="space-y-2 text-sm text-text-secondary ml-7">
              <li>• Secure, granular permissions - only access invited channels</li>
              <li>• Admin gatekeeping - bot must be invited to channels</li>
              <li>• No user impersonation - avoids broader access like DMs</li>
              <li>• Future-proof for Events API and real-time syncing</li>
            </ul>
          </div>

          {/* Setup Instructions Section */}
          <div className="bg-background-secondary rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText size={20} className="text-primary" />
              <h3 className="font-semibold text-text-primary">Setup Instructions:</h3>
            </div>
            <ol className="space-y-2 text-sm text-text-secondary ml-7 list-decimal list-inside">
              <li>
                Go to{" "}
                <a
                  href="https://api.slack.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Slack API
                </a>{" "}
                and create a new app
              </li>
              <li>Navigate to "OAuth & Permissions" in the sidebar</li>
              <li>
                Add bot token scopes:{" "}
                <code className="font-mono text-xs bg-background-primary px-2 py-1 rounded text-text-primary">
                  channels:read, channels:history, groups:read, groups:history, im:read, mpim:read
                </code>
              </li>
              <li>Install the app to your workspace</li>
              <li>
                Copy the "Bot User OAuth Token" (starts with{" "}
                <code className="font-mono text-xs bg-background-primary px-1 rounded text-text-primary">
                  xoxb-
                </code>
                )
              </li>
              <li>
                Invite the bot to channels you want to embed by pasting this command{" "}
                <code className="font-mono text-xs bg-background-primary px-2 py-1 rounded text-text-primary">
                  /invite @app_name
                </code>
              </li>
            </ol>
          </div>

          {/* Bot Token Input */}
          <div className="space-y-2">
            <label htmlFor="bot-token" className="text-sm font-medium text-text-primary">
              Bot Token
            </label>
            <Input
              id="bot-token"
              type="text"
              placeholder="xoxb-your-bot-token-here"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              className="bg-background-primary border-border-subtle text-text-primary placeholder:text-text-tertiary"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-text-secondary"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConnect}
            disabled={!botToken.trim()}
            className="bg-primary hover:bg-primary/90 text-white gap-2"
          >
            Connect & Continue
            <ArrowRight size={16} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
