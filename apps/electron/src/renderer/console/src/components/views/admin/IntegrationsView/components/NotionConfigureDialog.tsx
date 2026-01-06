import { useState, useEffect } from "react";
import { createLogger } from "../../../../../../../lib/logger";

const logger = createLogger("NotionConfigureDialog");
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FileText, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { authService } from "@/console/src/services/authService";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface NotionPage {
  id: string;
  title: string;
  url: string;
  created_time: string;
  last_edited_time: string;
}

interface NotionConfigureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  onReconnect: () => void;
}

export default function NotionConfigureDialog({
  open,
  onOpenChange,
  onSave,
  onReconnect,
}: NotionConfigureDialogProps) {
  const { toast } = useToast();
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchPages();
    }
  }, [open]);

  const fetchPages = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = authService.getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(`${API_BASE_URL}/api/integrations/notion/pages`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch pages");
      }

      const data = await response.json();
      setPages(data.pages || []);
    } catch (err) {
      logger.error("Error fetching pages:", err);
      setError(err instanceof Error ? err.message : "Failed to load pages");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setError(null);

      const token = authService.getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      const syncResponse = await fetch(`${API_BASE_URL}/api/integrations/notion/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (syncResponse.ok) {
        const result = await syncResponse.json();
        setSyncing(false);

        toast({
          title: "✅ Sync Complete!",
          description: result.message || `Synced ${result.pagesFound || 0} pages`,
        });

        onSave();
        setTimeout(() => onOpenChange(false), 500);
      } else {
        throw new Error("Sync request failed");
      }
    } catch (err) {
      logger.error("Error during sync:", err);
      setSyncing(false);
      setError(err instanceof Error ? err.message : "Failed to sync");
    }
  };

  const handleReconnect = () => {
    onOpenChange(false);
    onReconnect();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-background-elevated border-border-subtle max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl text-text-primary">Manage Notion Pages</DialogTitle>
          <DialogDescription className="text-text-secondary">
            View your currently shared pages and manage your Notion integration.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-indigo-500" size={32} />
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-sm text-red-400">{error}</p>
              <Button onClick={fetchPages} className="mt-3" variant="outline" size="sm">
                Retry
              </Button>
            </div>
          )}

          {/* Pages List */}
          {!loading && pages.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-text-primary">Shared Pages ({pages.length})</h3>
              </div>

              <div className="space-y-2">
                {pages.map((page) => (
                  <div
                    key={page.id}
                    className="flex items-center gap-3 p-3 bg-background-secondary rounded-lg hover:bg-background-secondary/80 transition-colors"
                  >
                    <FileText size={18} className="text-indigo-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-text-primary font-medium truncate">{page.title}</p>
                      <p className="text-xs text-text-tertiary">
                        Last edited: {new Date(page.last_edited_time).toLocaleDateString()}
                      </p>
                    </div>
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-tertiary hover:text-indigo-500 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Pages State */}
          {!loading && pages.length === 0 && !error && (
            <div className="text-center py-12 space-y-4">
              <FileText size={48} className="mx-auto text-text-tertiary" />
              <div>
                <p className="text-text-primary font-medium">No Pages Shared</p>
                <p className="text-sm text-text-secondary mt-1">
                  Reconnect to Notion to share pages
                </p>
              </div>
            </div>
          )}

          {/* Add/Remove Pages Info */}
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-text-primary text-sm">
              Want to add or remove pages?
            </h4>
            <p className="text-sm text-text-secondary">
              To modify which pages are shared, you'll need to reconnect to Notion. This will open
              the Notion authorization page where you can adjust your page selections.
            </p>
            <Button
              onClick={handleReconnect}
              variant="outline"
              size="sm"
              className="w-full border-indigo-500/30 hover:bg-indigo-500/10"
            >
              <RefreshCw size={14} className="mr-2" />
              Reconnect to Add/Remove Pages
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-text-secondary"
            disabled={syncing}
          >
            Close
          </Button>
          <Button
            onClick={handleSync}
            disabled={syncing || pages.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
          >
            {syncing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                Sync Now
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
