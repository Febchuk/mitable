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
import { ArrowRight, Loader2, ShieldCheck, GitBranch } from "lucide-react";
import { authService } from "@/console/src/services/authService";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface GitHubConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: () => void;
}

export default function GitHubConnectDialog({
  open,
  onOpenChange,
  onConnect,
}: GitHubConnectDialogProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      const token = authService.getAccessToken();
      if (!token) {
        throw new Error("Not authenticated. Please log in again.");
      }

      const response = await fetch(`${API_BASE_URL}/api/integrations/github/install/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorResponse = await response.json().catch(() => ({}));
        throw new Error(errorResponse.message || "Failed to start GitHub install flow");
      }

      const { installUrl } = await response.json();

      window.open(installUrl, "_blank");
      onOpenChange(false);
      onConnect();
    } catch (err) {
      console.error("Error starting GitHub install:", err);
      setError(err instanceof Error ? err.message : "Failed to connect to GitHub");
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-background-elevated border-border-subtle">
        <DialogHeader>
          <DialogTitle className="text-2xl text-text-primary">Connect GitHub</DialogTitle>
          <DialogDescription className="text-text-secondary">
            Install the Mitable GitHub App for your organization to sync repositories and commits.
            You'll finish the install on GitHub and then return here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-background-secondary rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <GitBranch size={20} className="text-primary" />
              <h3 className="font-semibold text-text-primary">What happens next</h3>
            </div>
            <ol className="space-y-2 text-sm text-text-secondary ml-7 list-decimal list-inside">
              <li>Choose the organization (or account) that will install the GitHub App.</li>
              <li>Select the repositories that Mitable should access.</li>
              <li>Authorize the installation and return to this screen.</li>
            </ol>
          </div>

          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-primary" />
              <span className="font-semibold text-text-primary">Permissions</span>
            </div>
            <p className="text-sm text-text-secondary">
              The app only receives read access to the repositories you select. You can add or remove
              repositories inside GitHub at any time.
            </p>
          </div>

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
                Opening GitHub...
              </>
            ) : (
              <>
                Connect to GitHub
                <ArrowRight size={16} />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
