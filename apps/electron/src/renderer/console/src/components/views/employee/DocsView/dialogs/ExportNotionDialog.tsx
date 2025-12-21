/**
 * ExportNotionDialog
 *
 * Dialog for exporting a document to Notion.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, AlertCircle, CheckCircle } from "lucide-react";

interface ExportNotionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentTitle: string;
  onExport: () => void;
  isExporting: boolean;
  existingNotionPageId?: string | null;
}

export default function ExportNotionDialog({
  open,
  onOpenChange,
  documentTitle,
  onExport,
  isExporting,
  existingNotionPageId,
}: ExportNotionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background-primary border-border-subtle sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-text-primary flex items-center gap-2">
            <ExternalLink className="text-primary" size={20} />
            Export to Notion
          </DialogTitle>
          <DialogDescription className="text-text-secondary">
            {existingNotionPageId
              ? "This document was previously exported to Notion. Export again to create a new page with the latest content."
              : "Export this document to your connected Notion workspace."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Document Info */}
          <div className="bg-background-elevated rounded-lg p-4 border border-border-subtle">
            <div className="text-sm text-text-secondary mb-1">Document</div>
            <div className="text-text-primary font-medium">{documentTitle}</div>
          </div>

          {/* Previous Export Warning */}
          {existingNotionPageId && (
            <div className="flex items-start gap-3 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
              <AlertCircle size={18} className="text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="text-yellow-400 font-medium">Previously Exported</div>
                <div className="text-text-secondary">
                  A new Notion page will be created. The previous export will not be updated.
                </div>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="flex items-start gap-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
            <CheckCircle size={18} className="text-primary flex-shrink-0 mt-0.5" />
            <div className="text-sm text-text-secondary">
              The document will be exported with full formatting including headings, lists, and code
              blocks.
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button
            onClick={onExport}
            disabled={isExporting}
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
                Export to Notion
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
