import { useState, useEffect } from "react";
import { createLogger } from "../../../../../../../lib/logger";

const logger = createLogger("GmailConfigureDialog");
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
import { FolderOpen, Loader2, RefreshCw, CheckCircle } from "lucide-react";
import { authService } from "@/console/src/services/authService";
import { Checkbox } from "@/components/ui/checkbox";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface DriveFolder {
  id: string;
  name: string;
  mimeType: string;
}

interface GmailConfigureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

export default function GmailConfigureDialog({
  open,
  onOpenChange,
  onSave,
}: GmailConfigureDialogProps) {
  const { toast } = useToast();
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchFolders();
      fetchSelectedFolders();
    }
  }, [open]);

  const fetchFolders = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = authService.getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(`${API_BASE_URL}/api/documents/google-drive-folders`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch folders");
      }

      const data = await response.json();
      setFolders(data.folders || []);
    } catch (err) {
      logger.error("Error fetching folders:", err);
      setError(err instanceof Error ? err.message : "Failed to load folders");
    } finally {
      setLoading(false);
    }
  };

  const fetchSelectedFolders = async () => {
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/integrations/gmail/folders`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedFolderIds(data.selectedFolderIds || []);
      }
    } catch (err) {
      logger.error("Error fetching selected folders:", err);
    }
  };

  const handleToggleFolder = (folderId: string) => {
    setSelectedFolderIds((prev) =>
      prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const token = authService.getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(`${API_BASE_URL}/api/integrations/gmail/folders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ selectedFolderIds }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save folder selection");
      }

      toast({
        title: "✅ Saved!",
        description: `${selectedFolderIds.length} folder${selectedFolderIds.length !== 1 ? "s" : ""} selected for Google Docs exports`,
      });

      onSave();
      setTimeout(() => onOpenChange(false), 500);
    } catch (err) {
      logger.error("Error saving folders:", err);
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-background-elevated border-border-subtle max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl text-text-primary">
            Manage Google Drive Folders
          </DialogTitle>
          <DialogDescription className="text-text-secondary">
            Select which folders you want to use for exporting documents to Google Docs.
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
              <Button onClick={fetchFolders} className="mt-3" variant="outline" size="sm">
                Retry
              </Button>
            </div>
          )}

          {/* Folders List */}
          {!loading && folders.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-text-primary">
                  Available Folders ({folders.length})
                </h3>
                <Button onClick={fetchFolders} variant="ghost" size="sm" className="gap-2">
                  <RefreshCw size={14} />
                  Refresh
                </Button>
              </div>

              <div className="space-y-2">
                {folders.map((folder) => {
                  const isSelected = selectedFolderIds.includes(folder.id);
                  return (
                    <div
                      key={folder.id}
                      onClick={() => handleToggleFolder(folder.id)}
                      className="flex items-center gap-3 p-3 bg-background-secondary rounded-lg hover:bg-background-secondary/80 transition-colors cursor-pointer"
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggleFolder(folder.id)}
                      />
                      <FolderOpen size={18} className="text-indigo-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-text-primary font-medium truncate">{folder.name}</p>
                      </div>
                      {isSelected && <CheckCircle size={16} className="text-green-500" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* No Folders State */}
          {!loading && folders.length === 0 && !error && (
            <div className="text-center py-12 space-y-4">
              <FolderOpen size={48} className="mx-auto text-text-tertiary" />
              <div>
                <p className="text-text-primary font-medium">No Folders Found</p>
                <p className="text-sm text-text-secondary mt-1">
                  Create folders in your Google Drive first
                </p>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-text-primary text-sm">How folder selection works</h4>
            <p className="text-sm text-text-secondary">
              Only selected folders will appear in the export dialog when you export documents to
              Google Docs. You can change this selection at any time.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-text-secondary"
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || selectedFolderIds.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle size={16} />
                Save Selection
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
