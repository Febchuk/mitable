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

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { createLogger } from "../../../../../../lib/logger";
import { getLocale } from "@/console/src/lib/date";

const logger = createLogger("DocDetail");
import {
  useDocument,
  useCreateDocument,
  useDeleteDocument,
  useUpdateDocument,
  useExportToNotion,
  useExportToGoogleDocs,
  useGoogleDriveFolders,
} from "@/console/src/hooks/queries/documents";
import {
  ArrowLeft,
  Trash2,
  Loader2,
  FileText,
  BookOpen,
  AlertCircle,
  CheckCircle,
  Clock,
  ExternalLink,
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
import ExportGoogleDocsDialog from "./dialogs/ExportGoogleDocsDialog";
import ExportPopover, { type ExportDestination } from "./components/ExportPopover";
import type { DocType, DocStatus } from "@mitable/shared";
import { useUser } from "@/console/src/context/UserContext";
import { apiRequest } from "@/console/src/services/api";

interface GmailStatus {
  connected: boolean;
  expired: boolean;
  email: string | null;
}

interface NotionStatus {
  connected: boolean;
  expired: boolean;
  workspaceId: string | null;
}

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
  const { user } = useUser();

  // Check if this is a new document
  const isNewDocument = docId === "new";

  const { data: document, isLoading, refetch: refetchDocument } = useDocument(docId || "");
  const createMutation = useCreateDocument();
  const updateMutation = useUpdateDocument();
  const deleteMutation = useDeleteDocument();
  const exportNotionMutation = useExportToNotion();
  const exportGoogleDocsMutation = useExportToGoogleDocs();
  const { data: notionStatus, isLoading: isNotionStatusLoading } = useQuery({
    queryKey: ["integrations", "notion", "user", "status"],
    queryFn: () => apiRequest<NotionStatus>("/integrations/notion/user/status"),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: gmailStatus, isLoading: isGmailStatusLoading } = useQuery({
    queryKey: ["integrations", "gmail", "status"],
    queryFn: () => apiRequest<GmailStatus>("/integrations/gmail/status"),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const googleDocsAvailable = !!gmailStatus?.connected && !gmailStatus?.expired;
  const notionAvailable = !!notionStatus?.connected && !notionStatus?.expired;

  const {
    data: driveFolders,
    isLoading: isLoadingFolders,
    refetch: refetchFolders,
  } = useGoogleDriveFolders(googleDocsAvailable);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isExportNotionDialogOpen, setIsExportNotionDialogOpen] = useState(false);
  const [isExportGoogleDocsDialogOpen, setIsExportGoogleDocsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [title, setTitle] = useState(isNewDocument ? "Untitled Document" : "");
  const [createdDocId, setCreatedDocId] = useState<string | null>(null); // Track if we've created the doc

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

  useEffect(() => {
    if (!notionAvailable) {
      setIsExportNotionDialogOpen(false);
    }
    if (!googleDocsAvailable) {
      setIsExportGoogleDocsDialogOpen(false);
    }
  }, [notionAvailable, googleDocsAvailable]);

  // Debounced save function (handles both new and existing documents)
  const debouncedSave = useCallback(
    async (field: "title" | "content", value: string) => {
      // For new documents, don't autosave - wait for explicit ⌘+S
      if (isNewDocument && !createdDocId) {
        return;
      }

      // Use the created ID if we just created the doc, otherwise use docId
      const targetId = createdDocId || docId;
      if (!targetId || targetId === "new") return;

      setIsSaving(true);
      try {
        await updateMutation.mutateAsync({
          id: targetId,
          data: { [field]: value },
        });
        setLastSaved(new Date());
      } catch (error) {
        logger.error(`${field} autosave failed:`, error);
      } finally {
        setIsSaving(false);
      }
    },
    [docId, isNewDocument, createdDocId, updateMutation]
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
      // Clear pending timeouts and save immediately
      if (titleSaveTimeout.current) clearTimeout(titleSaveTimeout.current);
      if (contentSaveTimeout.current) clearTimeout(contentSaveTimeout.current);

      setIsSaving(true);
      try {
        // If this is a new document, create it first
        if (isNewDocument && !createdDocId) {
          const result = await createMutation.mutateAsync({
            title: title || "Untitled Document",
            docType: "knowledge-article",
            content: contentToSave,
          });
          const newDocId = result.document.id;
          setCreatedDocId(newDocId);
          setLastSaved(new Date());
          // Navigate to the new document URL
          navigate(`/docs/${newDocId}`, { replace: true });
          toast({
            title: "Document created",
            description: "Your document has been saved.",
          });
          return;
        }

        // Update existing document
        const targetId = createdDocId || docId;
        if (!targetId || targetId === "new") return;

        await updateMutation.mutateAsync({
          id: targetId,
          data: {
            title,
            content: contentToSave,
          },
        });
        setLastSaved(new Date());
      } catch (error) {
        logger.error("Manual save failed:", error);
        toast({
          title: "Save failed",
          description: "Failed to save document.",
          variant: "destructive",
        });
      } finally {
        setIsSaving(false);
      }
    },
    [docId, title, isNewDocument, createdDocId, createMutation, updateMutation, navigate, toast]
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
      const result = await exportNotionMutation.mutateAsync({ id: docId });
      setIsExportNotionDialogOpen(false);

      // Force immediate UI update
      await refetchDocument();

      toast({
        title: "Exported to Notion",
        description: "Document has been exported successfully.",
      });
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

  const handleExportToGoogleDocs = async (folderId?: string) => {
    if (!docId) return;

    try {
      const result = await exportGoogleDocsMutation.mutateAsync({ id: docId, folderId });
      console.log("✅ [Export] Google Docs export result:", result);
      setIsExportGoogleDocsDialogOpen(false);

      // Force immediate UI update
      const refetchResult = await refetchDocument();
      console.log("✅ [Export] Refetched document data:", refetchResult.data);

      toast({
        title: "Exported to Google Docs",
        description: "Document has been exported successfully.",
      });
      if (result.documentUrl) {
        window.open(result.documentUrl, "_blank");
      }
    } catch (error) {
      console.error("❌ [Export] Failed:", error);
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Failed to export to Google Docs.",
        variant: "destructive",
      });
    }
  };

  const handleReExportToNotion = async () => {
    if (!docId) return;
    await handleExportToNotion();
  };

  const handleReExportToGoogleDocs = async () => {
    if (!docId) return;
    await handleExportToGoogleDocs();
  };

  const handleExportToAll = async () => {
    if (!docId) return;
    await Promise.all([handleExportToNotion(), handleExportToGoogleDocs()]);
    toast({
      title: "Exported to all destinations",
      description: "Document has been synced to Notion and Google Docs.",
    });
  };

  const exportDestinations = useMemo<ExportDestination[]>(() => {
    if (!document) return [];

    const destinations: ExportDestination[] = [];

    if (notionAvailable) {
      destinations.push({
        id: "notion",
        name: "Notion",
        isExported: !!document.notionPageId,
        lastSyncedAt: document.notionSyncedAt ? new Date(document.notionSyncedAt) : null,
        documentUrl: document.notionPageId ? `https://notion.so/${document.notionPageId}` : null,
        onExport: () => setIsExportNotionDialogOpen(true),
        onReExport: handleReExportToNotion,
      });
    }

    if (googleDocsAvailable) {
      destinations.push({
        id: "google-docs",
        name: "Google Docs",
        isExported: !!document.googleDocsId,
        lastSyncedAt: document.googleDocsSyncedAt ? new Date(document.googleDocsSyncedAt) : null,
        documentUrl: document.googleDocsId
          ? `https://docs.google.com/document/d/${document.googleDocsId}/edit`
          : null,
        onExport: () => setIsExportGoogleDocsDialogOpen(true),
        onReExport: handleReExportToGoogleDocs,
      });
    }

    return destinations;
  }, [
    document,
    googleDocsAvailable,
    notionAvailable,
    handleReExportToGoogleDocs,
    handleReExportToNotion,
  ]);

  const hasExportIntegrations = exportDestinations.length > 0;
  const isIntegrationStatusLoading = isNotionStatusLoading || isGmailStatusLoading;

  if (isLoading && !isNewDocument) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="animate-spin text-text-secondary" size={32} />
      </div>
    );
  }

  if (!document && !isNewDocument) {
    return (
      <div className="p-8 text-center">
        <p className="text-text-secondary">Document not found</p>
        <Button variant="link" onClick={() => navigate("/docs")} className="mt-4">
          Back to documents
        </Button>
      </div>
    );
  }

  // For new documents, use defaults
  const docType = document?.docType || "knowledge-article";
  const docStatus = document?.status || "draft";
  const Icon = getDocTypeIcon(docType as DocType);
  const statusColor = DOC_STATUS_COLORS[docStatus as DocStatus];

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
                  {DOC_TYPE_LABELS[docType as DocType]}
                </span>
                <Badge className={statusColor}>{docStatus}</Badge>
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

          {hasExportIntegrations && !isNewDocument ? (
            <ExportPopover
              destinations={exportDestinations}
              onExportAll={
                notionAvailable &&
                googleDocsAvailable &&
                document?.notionPageId &&
                document?.googleDocsId
                  ? handleExportToAll
                  : undefined
              }
              isExporting={exportNotionMutation.isPending || exportGoogleDocsMutation.isPending}
            />
          ) : (
            <Button
              variant="outline"
              className="bg-background-elevated border-border-subtle text-text-primary hover:bg-background-hover gap-2"
              onClick={() => navigate("/profile?tab=integrations")}
              disabled={isIntegrationStatusLoading}
            >
              <ExternalLink size={16} />
              Export
            </Button>
          )}
          {!isNewDocument && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsDeleteDialogOpen(true)}
              className="text-status-error hover:text-status-error hover:bg-status-error/10"
            >
              <Trash2 size={18} />
            </Button>
          )}
        </div>
      </div>

      {/* Metadata bar */}
      <div className="flex items-center gap-6 text-sm px-6 py-3 border-b border-border-subtle bg-background-secondary/30">
        {document ? (
          <>
            <div className="flex items-center gap-2 text-text-secondary">
              <Clock size={14} />
              <span>
                Updated:{" "}
                <span className="text-text-primary">
                  {new Date(document.updatedAt).toLocaleDateString(getLocale(), {
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
                <span>Synced</span>
              </div>
            )}
          </>
        ) : (
          <div className="text-text-secondary">
            New document - press{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-background-tertiary border border-border-subtle">
              ⌘+S
            </kbd>{" "}
            to save
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
      <div className="flex-1 overflow-auto bg-background-primary">
        <div className="max-w-4xl mx-auto px-8 py-6">
          <DocEditor
            key={docId} // Reset editor when document changes
            initialContent={document?.content || ""}
            onChange={handleContentChange}
            onSave={handleSave}
            documentId={docId}
            variant="default"
            placeholder="Start writing your document... Press / for commands or ⌘+J for AI assistance."
            autosaveDelay={3000}
            className="h-full"
          />
        </div>
      </div>

      {/* Contributing Sessions (collapsed at bottom if exists) */}
      {document?.sessionContributions && document.sessionContributions.length > 0 && (
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
                    {contribution.session?.name || "Untitled Session"}
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

      {/* Export Dialogs - only shown for existing documents */}
      {document && (
        <>
          <ExportNotionDialog
            open={isExportNotionDialogOpen}
            onOpenChange={setIsExportNotionDialogOpen}
            documentTitle={document.title}
            onExport={handleExportToNotion}
            isExporting={exportNotionMutation.isPending}
            existingNotionPageId={document.notionPageId}
          />

          <ExportGoogleDocsDialog
            open={isExportGoogleDocsDialogOpen}
            onOpenChange={setIsExportGoogleDocsDialogOpen}
            documentTitle={document.title}
            onExport={handleExportToGoogleDocs}
            isExporting={exportGoogleDocsMutation.isPending}
            existingGoogleDocsId={document.googleDocsId}
            folders={driveFolders?.folders || []}
            isLoadingFolders={isLoadingFolders}
            onRefreshFolders={() => refetchFolders()}
          />
        </>
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
