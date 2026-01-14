/**
 * DocDetail
 *
 * Detailed view of a single document with Plate UI rich text editor.
 * Features:
 * - Inline editing with rich formatting
 * - AI assistance (⌘+J for AI menu)
 * - Autosave functionality
 * - Export to Notion
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { createLogger } from "../../../../../../lib/logger";

const logger = createLogger("DocDetail");
import {
  useDocument,
  useDeleteDocument,
  useUpdateDocument,
  useExportToNotion,
} from "@/console/src/hooks/queries/documents";
import {
  ArrowLeft,
  Trash2,
  Loader2,
  FileText,
  BookOpen,
  AlertCircle,
  ExternalLink,
  CheckCircle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { DocEditor } from "@/console/src/components/editor";
import ExportNotionDialog from "./dialogs/ExportNotionDialog";
import type { DocType, DocStatus } from "@mitable/shared";

const DOC_TYPE_LABELS: Record<DocType, string> = {
  "how-to": "How-To Guide",
  "knowledge-article": "Knowledge Article",
  troubleshooting: "Troubleshooting Guide",
};

const DOC_STATUS_COLORS: Record<DocStatus, string> = {
  draft: "bg-yellow-500/20 text-yellow-400",
  published: "bg-green-500/20 text-green-400",
  archived: "bg-gray-500/20 text-gray-400",
};

export default function DocDetail() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: document, isLoading } = useDocument(docId || "");
  const updateMutation = useUpdateDocument();
  const deleteMutation = useDeleteDocument();
  const exportMutation = useExportToNotion();

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [title, setTitle] = useState("");

  // Debounce timers
  const titleSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const contentSaveTimeout = useRef<NodeJS.Timeout | null>(null);

  // Initialize title when document loads
  useEffect(() => {
    if (document) {
      setTitle(document.title);
      setLastSaved(new Date(document.updatedAt));
    }
  }, [document]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (titleSaveTimeout.current) clearTimeout(titleSaveTimeout.current);
      if (contentSaveTimeout.current) clearTimeout(contentSaveTimeout.current);
    };
  }, []);

  // Debounced save function
  const debouncedSave = useCallback(
    async (field: "title" | "content", value: string) => {
      if (!docId) return;

      setIsSaving(true);
      try {
        await updateMutation.mutateAsync({
          id: docId,
          data: { [field]: value },
        });
        setLastSaved(new Date());
      } catch (error) {
        logger.error(`${field} autosave failed:`, error);
      } finally {
        setIsSaving(false);
      }
    },
    [docId, updateMutation]
  );

  // Handle title change with debounced autosave
  const handleTitleChange = useCallback(
    (newTitle: string) => {
      // Update local state immediately (no lag)
      setTitle(newTitle);

      // Clear existing timeout
      if (titleSaveTimeout.current) {
        clearTimeout(titleSaveTimeout.current);
      }

      // Debounce the API call (wait 1 second after typing stops)
      titleSaveTimeout.current = setTimeout(() => {
        debouncedSave("title", newTitle);
      }, 1000);
    },
    [debouncedSave]
  );

  // Handle content change with debounced autosave
  const handleContentChange = useCallback(
    (newContent: string) => {
      // Clear existing timeout
      if (contentSaveTimeout.current) {
        clearTimeout(contentSaveTimeout.current);
      }

      // Debounce the API call (wait 2 seconds after typing stops)
      contentSaveTimeout.current = setTimeout(() => {
        debouncedSave("content", newContent);
      }, 2000);
    },
    [debouncedSave]
  );

  // Handle explicit save from editor (⌘+S)
  const handleSave = useCallback(
    async (contentToSave: string) => {
      if (!docId) return;

      // Clear pending timeouts and save immediately
      if (titleSaveTimeout.current) clearTimeout(titleSaveTimeout.current);
      if (contentSaveTimeout.current) clearTimeout(contentSaveTimeout.current);

      setIsSaving(true);
      try {
        await updateMutation.mutateAsync({
          id: docId,
          data: {
            title,
            content: contentToSave,
          },
        });
        setLastSaved(new Date());
      } catch (error) {
        logger.error("Manual save failed:", error);
      } finally {
        setIsSaving(false);
      }
    },
    [docId, title, updateMutation]
  );

  const handleDelete = async () => {
    if (!docId) return;

    try {
      await deleteMutation.mutateAsync(docId);
      navigate("/docs");
      toast({
        title: "Document deleted",
        description: "The document has been deleted.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete document.",
        variant: "destructive",
      });
    }
  };

  const handleExportToNotion = async () => {
    if (!docId) return;

    try {
      const result = await exportMutation.mutateAsync({ id: docId });
      setIsExportDialogOpen(false);
      toast({
        title: "Exported to Notion",
        description: "Document has been exported successfully.",
      });
      // Open Notion page in browser
      if (result.notionPageUrl) {
        window.open(result.notionPageUrl, "_blank");
      }
    } catch (error) {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Failed to export to Notion.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="animate-spin text-text-secondary" size={32} />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="p-8 text-center">
        <p className="text-text-secondary">Document not found</p>
        <Button variant="link" onClick={() => navigate("/docs")} className="mt-4">
          Back to documents
        </Button>
      </div>
    );
  }

  const Icon = getDocTypeIcon(document.docType as DocType);
  const statusColor = DOC_STATUS_COLORS[document.status as DocStatus];

  return (
    <div className="h-full flex flex-col app-no-drag">
      {/* Header */}
      <div className="flex items-start justify-between p-6 border-b border-border-subtle">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/docs")}
            className="text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={20} />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon size={20} className="text-primary" />
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="text-xl font-bold text-text-primary bg-transparent border-none outline-none focus:outline-none w-full max-w-2xl"
                placeholder="Document title..."
              />
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-text-secondary text-sm">
                  {DOC_TYPE_LABELS[document.docType as DocType]}
                </span>
                <Badge className={statusColor}>{document.status}</Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Google Docs-style save indicator */}
          <span className="text-xs text-text-secondary flex items-center gap-1.5 mr-2">
            {isSaving ? (
              <>
                <Loader2 className="animate-spin" size={14} />
                <span>Saving...</span>
              </>
            ) : lastSaved ? (
              <>
                <CheckCircle size={14} className="text-status-success" />
                <span>All changes saved</span>
              </>
            ) : null}
          </span>

          <Button
            variant="outline"
            onClick={() => setIsExportDialogOpen(true)}
            className="gap-2 border-primary/50 text-primary hover:bg-primary/10 hover:border-primary"
            disabled={exportMutation.isPending || isSaving}
          >
            {exportMutation.isPending ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <ExternalLink size={16} />
            )}
            {document.notionPageId ? "Re-export" : "Export to Notion"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDeleteDialogOpen(true)}
            className="text-status-error hover:text-status-error hover:bg-status-error/10"
          >
            <Trash2 size={18} />
          </Button>
        </div>
      </div>

      {/* Metadata bar */}
      <div className="flex items-center gap-6 text-sm px-6 py-3 border-b border-border-subtle bg-background-secondary/30">
        <div className="flex items-center gap-2 text-text-secondary">
          <Clock size={14} />
          <span>
            Updated:{" "}
            <span className="text-text-primary">
              {new Date(document.updatedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </span>
        </div>
        {document.creator && (
          <div className="text-text-secondary">
            By:{" "}
            <span className="text-text-primary">
              {document.creator.firstName} {document.creator.lastName}
            </span>
          </div>
        )}
        {document.notionPageId && (
          <div className="flex items-center gap-1 text-status-success">
            <CheckCircle size={14} />
            <span>Synced to Notion</span>
          </div>
        )}
        <div className="ml-auto text-text-tertiary text-xs">
          Press{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-background-tertiary border border-border-subtle">
            ⌘+J
          </kbd>{" "}
          for AI assistance
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden bg-background-primary pl-3 pr-5 pt-3">
        <DocEditor
          key={docId} // Reset editor when document changes
          initialContent={document.content}
          onChange={handleContentChange}
          onSave={handleSave}
          documentId={docId}
          variant="fullWidth"
          placeholder="Start writing your document... Press / for commands or ⌘+J for AI assistance."
          autosaveDelay={3000}
          className="h-full"
        />
      </div>

      {/* Contributing Sessions (collapsed at bottom if exists) */}
      {document.sessionContributions && document.sessionContributions.length > 0 && (
        <div className="border-t border-border-subtle p-4 bg-background-secondary/30">
          <details className="group">
            <summary className="text-sm font-medium text-text-secondary cursor-pointer hover:text-text-primary">
              Contributing Sessions ({document.sessionContributions.length})
            </summary>
            <div className="mt-2 space-y-1">
              {document.sessionContributions.map((contribution) => (
                <div
                  key={contribution.id}
                  className="flex items-center justify-between text-sm py-1"
                >
                  <span className="text-text-primary">
                    {contribution.session?.name || "Work Session"}
                    <span className="text-text-tertiary ml-2">
                      ({contribution.contributionType})
                    </span>
                  </span>
                  {contribution.session?.startedAt && (
                    <span className="text-text-tertiary">
                      {new Date(contribution.session.startedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="bg-background-primary border-border-subtle">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Delete Document</DialogTitle>
            <DialogDescription className="text-text-secondary">
              Are you sure you want to delete this document? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-status-error text-white hover:bg-status-error/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={16} />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <ExportNotionDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        documentTitle={document.title}
        onExport={handleExportToNotion}
        isExporting={exportMutation.isPending}
        existingNotionPageId={document.notionPageId}
      />
    </div>
  );
}

function getDocTypeIcon(docType: DocType) {
  switch (docType) {
    case "how-to":
      return BookOpen;
    case "knowledge-article":
      return FileText;
    case "troubleshooting":
      return AlertCircle;
    default:
      return FileText;
  }
}
