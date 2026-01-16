/**
 * ExportGoogleDocsDialog
 *
 * Dialog for exporting a document to Google Docs with optional folder selection.
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, CheckCircle, FolderOpen, RefreshCw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DriveFolder {
  id: string;
  name: string;
  mimeType: string;
}

interface ExportGoogleDocsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentTitle: string;
  onExport: (folderId?: string) => void;
  isExporting: boolean;
  existingGoogleDocsId?: string | null;
  folders: DriveFolder[];
  isLoadingFolders: boolean;
  onRefreshFolders?: () => void;
}

export default function ExportGoogleDocsDialog({
  open,
  onOpenChange,
  documentTitle,
  onExport,
  isExporting,
  existingGoogleDocsId,
  folders,
  isLoadingFolders,
  onRefreshFolders,
}: ExportGoogleDocsDialogProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>();

  // Auto-select first folder when dialog opens
  useEffect(() => {
    if (open && !existingGoogleDocsId) {
      setSelectedFolderId(folders[0]?.id || undefined);
    }
  }, [open, existingGoogleDocsId, folders]);

  const handleExport = () => {
    onExport(selectedFolderId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background-primary border-border-subtle sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-text-primary flex items-center gap-2">
            <ExternalLink className="text-primary" size={20} />
            Export to Google Docs
          </DialogTitle>
          <DialogDescription className="text-text-secondary">
            {existingGoogleDocsId
              ? "This document was previously exported to Google Docs. Export again to update the existing document with the latest content."
              : "Export this document to your Google Drive as a Google Doc."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Document Info */}
          <div className="bg-background-elevated rounded-lg p-4 border border-border-subtle">
            <div className="text-sm text-text-secondary mb-1">Document</div>
            <div className="text-text-primary font-medium">{documentTitle}</div>
          </div>

          {/* Folder Selection (only for new exports) */}
          {!existingGoogleDocsId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-text-primary flex items-center gap-2">
                  <FolderOpen size={16} />
                  Destination Folder
                </label>
                {onRefreshFolders && folders.length > 0 && (
                  <button
                    onClick={onRefreshFolders}
                    disabled={isLoadingFolders}
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={isLoadingFolders ? "animate-spin" : ""} />
                    Refresh
                  </button>
                )}
              </div>

              {isLoadingFolders ? (
                <div className="flex items-center gap-2 p-3 bg-background-elevated border border-border-subtle rounded-lg">
                  <Loader2 className="animate-spin" size={14} />
                  <span className="text-sm text-text-secondary">Loading folders...</span>
                </div>
              ) : folders.length > 0 ? (
                <Select value={selectedFolderId} onValueChange={setSelectedFolderId}>
                  <SelectTrigger className="bg-background-elevated border-border-subtle text-text-primary">
                    <SelectValue placeholder="Select destination folder" />
                  </SelectTrigger>
                  <SelectContent className="bg-background-elevated border-border-subtle">
                    {folders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id} className="text-text-primary">
                        {folder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <p className="text-sm text-text-secondary">
                    No folders found in your Google Drive. Create a folder first.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Previous Export Info */}
          {existingGoogleDocsId && (
            <div className="flex items-start gap-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <CheckCircle size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="text-blue-400 font-medium">Previously Exported</div>
                <div className="text-text-secondary">
                  The existing Google Doc will be updated with the latest content.
                </div>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="flex items-start gap-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
            <CheckCircle size={18} className="text-primary flex-shrink-0 mt-0.5" />
            <div className="text-sm text-text-secondary">
              The document will be exported with formatting including headings, bold, italic, and
              lists.
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || (!existingGoogleDocsId && !selectedFolderId)}
            className="bg-primary text-white hover:bg-primary/90 gap-2"
          >
            {isExporting ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                Exporting...
              </>
            ) : (
              <>
                <ExternalLink size={16} />
                Export to Google Docs
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
