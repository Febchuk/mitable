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
import { useParams, useNavigate, useLocation } from "react-router-dom";
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
import { ArrowLeft, Trash2, Loader2, CheckCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import AIEditPanel from "@/console/src/components/shared/AIEditPanel";
import { reviseDocument } from "@/console/src/services/documentsService";
import ExportNotionDialog from "./dialogs/ExportNotionDialog";
import ExportGoogleDocsDialog from "./dialogs/ExportGoogleDocsDialog";
import ExportPopover, { type ExportDestination } from "./components/ExportPopover";
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

function stripLeadingTitle(markdown: string): string {
  if (!markdown) return markdown;
  const trimmed = markdown.replace(/^\n+/, "");
  if (trimmed.startsWith("# ")) {
    const firstNewline = trimmed.indexOf("\n");
    if (firstNewline === -1) return "";
    return trimmed.slice(firstNewline).replace(/^\n+/, "");
  }
  return markdown;
}

export default function DocDetail() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
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
  const isReportRoute = location.pathname.startsWith("/reports");
  const basePath = isReportRoute ? "/reports" : "/docs";
  const entityLabel = isReportRoute ? "Report" : "Document";
  const entityLabelLower = entityLabel.toLowerCase();

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isExportNotionDialogOpen, setIsExportNotionDialogOpen] = useState(false);
  const [isExportGoogleDocsDialogOpen, setIsExportGoogleDocsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [title, setTitle] = useState(isNewDocument ? `Untitled ${entityLabel}` : "");
  const [createdDocId, setCreatedDocId] = useState<string | null>(null); // Track if we've created the doc
  const [isAIEditMode, setIsAIEditMode] = useState(false);
  const latestContentRef = useRef<string>("");
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Debounce timers
  const titleSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const contentSaveTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (document) {
      setTitle(document.title);
      setLastSaved(new Date(document.updatedAt));
    }
  }, [document]);

  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = "auto";
      titleRef.current.style.height = titleRef.current.scrollHeight + "px";
    }
  }, [title]);

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
      latestContentRef.current = newContent;

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

  // AI Edit Mode handlers
  const handleRevise = async (instruction: string, currentContent: string) => {
    const targetId = createdDocId || docId;
    if (!targetId || targetId === "new") throw new Error("Document not saved yet");
    const result = await reviseDocument(targetId, instruction, currentContent);
    return result;
  };

  const handleSaveFromAIEditor = async (editedContent: string) => {
    const targetId = createdDocId || docId;
    if (!targetId || targetId === "new") return;
    await updateMutation.mutateAsync({ id: targetId, data: { content: editedContent } });
    setLastSaved(new Date());
    setIsAIEditMode(false);
    // Refetch so the Plate editor picks up the updated content
    refetchDocument();
  };

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
            title: title || `Untitled ${entityLabel}`,
            docType: "knowledge-article",
            content: contentToSave,
            tags: isReportRoute ? ["report"] : [],
          });
          const newDocId = result.document.id;
          setCreatedDocId(newDocId);
          setLastSaved(new Date());
          // Navigate to the new document URL
          navigate(`${basePath}/${newDocId}`, { replace: true });
          toast({
            title: `${entityLabel} created`,
            description: `Your ${entityLabelLower} has been saved.`,
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
          description: `Failed to save ${entityLabelLower}.`,
          variant: "destructive",
        });
      } finally {
        setIsSaving(false);
      }
    },
    [
      basePath,
      createdDocId,
      createMutation,
      docId,
      entityLabel,
      entityLabelLower,
      isNewDocument,
      isReportRoute,
      navigate,
      title,
      toast,
      updateMutation,
    ]
  );

  const handleDelete = async () => {
    if (!docId) return;

    try {
      await deleteMutation.mutateAsync(docId);
      navigate(basePath);
      toast({
        title: `${entityLabel} deleted`,
        description: `The ${entityLabelLower} has been deleted.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to delete ${entityLabelLower}.`,
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

  // Initialize latestContentRef from document
  useEffect(() => {
    if (document?.content) {
      latestContentRef.current = document.content;
    }
  }, [document?.content]);

  // AI Edit Mode - full page takeover (same pattern as RecapDetail / SessionDetail)
  if (isAIEditMode && (document?.content || latestContentRef.current)) {
    const targetId = createdDocId || docId;
    return (
      <AIEditPanel
        title={`Edit ${entityLabel}`}
        subtitle={title || document?.title || entityLabel}
        initialContent={latestContentRef.current || document?.content || ""}
        onSave={handleSaveFromAIEditor}
        onAutoSave={async (content: string) => {
          if (!targetId || targetId === "new") return;
          await updateMutation.mutateAsync({ id: targetId, data: { content } });
        }}
        onCancel={() => setIsAIEditMode(false)}
        onRevise={handleRevise}
        placeholder={`Edit your ${entityLabelLower} content...`}
        contextLabel={entityLabelLower}
        documentId={targetId !== "new" ? targetId : undefined}
      />
    );
  }

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
        <p className="text-text-secondary">{entityLabel} not found</p>
        <Button variant="link" onClick={() => navigate(basePath)} className="mt-4">
          Back to {entityLabelLower}s
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full app-no-drag" style={{ overflow: "auto" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 24px 96px" }}>
        {/* Top bar: back + actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 32,
          }}
        >
          <button
            onClick={() => navigate(basePath)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-tertiary)",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
            }}
          >
            <ArrowLeft size={18} />
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
              <button
                onClick={() => navigate("/profile?tab=integrations")}
                disabled={isIntegrationStatusLoading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "7px 12px",
                  borderRadius: 8,
                  border: "0.5px solid rgba(var(--ui-rgb), 0.1)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  fontFamily: "var(--font-sans)",
                  fontWeight: 500,
                  cursor: isIntegrationStatusLoading ? "default" : "pointer",
                  opacity: isIntegrationStatusLoading ? 0.5 : 1,
                }}
              >
                <ExternalLink size={14} />
                Export
              </button>
            )}
            {!isNewDocument && (
              <button
                onClick={() => setIsDeleteDialogOpen(true)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-tertiary)",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        <textarea
          ref={titleRef}
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Untitled"
          rows={1}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            overflow: "hidden",
            color: "var(--text-primary)",
            fontFamily: "var(--font-serif)",
            fontSize: 38,
            lineHeight: 1.2,
            letterSpacing: "-0.03em",
            fontWeight: 400,
            padding: 0,
            marginBottom: 14,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />

        {/* Metadata row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            fontSize: 12,
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-sans)",
            marginBottom: 24,
          }}
        >
          {document ? (
            <>
              <span style={{ color: "var(--text-secondary)" }}>
                {new Date(document.updatedAt).toLocaleDateString(getLocale(), {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              {document.creator && (
                <>
                  <span style={{ color: "#4A473F" }}>·</span>
                  <span>
                    {document.creator.firstName} {document.creator.lastName}
                  </span>
                </>
              )}
              {document.notionPageId && (
                <>
                  <span style={{ color: "#4A473F" }}>·</span>
                  <span style={{ color: "var(--status-success)" }}>Synced</span>
                </>
              )}
            </>
          ) : (
            <span>
              Press <span style={{ color: "var(--text-secondary)" }}>⌘+S</span> to save
            </span>
          )}
          <span style={{ color: "#4A473F" }}>·</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            {isSaving ? (
              <>
                <Loader2 size={11} className="animate-spin" />
                Saving…
              </>
            ) : lastSaved ? (
              <>
                <CheckCircle size={11} style={{ color: "var(--status-success)" }} />
                Saved
              </>
            ) : (
              <span style={{ color: "#4A473F" }}>Unsaved</span>
            )}
          </span>
        </div>

        {/* Editor — no wrapper box, just flows into the page */}
        <DocEditor
          key={docId}
          initialContent={stripLeadingTitle(document?.content || "")}
          onChange={handleContentChange}
          onSave={handleSave}
          documentId={docId}
          variant="fullWidth"
          placeholder={`Start writing...`}
          autosaveDelay={3000}
          className="min-h-[520px]"
        />

        {document?.sessionContributions && document.sessionContributions.length > 0 && (
          <div
            style={{
              marginTop: 40,
              paddingTop: 20,
              borderTop: "0.5px solid rgba(var(--ui-rgb), 0.06)",
            }}
          >
            <details>
              <summary
                style={{ fontSize: 12, fontWeight: 500, color: "var(--text-tertiary)", cursor: "pointer" }}
              >
                Contributing Sessions ({document.sessionContributions.length})
              </summary>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {document.sessionContributions.map((contribution) => (
                  <div
                    key={contribution.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: "var(--text-primary)" }}>
                      {contribution.session?.name || "Untitled Session"}
                      <span style={{ color: "var(--text-tertiary)", marginLeft: 8 }}>
                        ({contribution.contributionType})
                      </span>
                    </span>
                    {contribution.session?.startedAt && (
                      <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>
                        {new Date(contribution.session.startedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>

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
            <DialogTitle className="text-text-primary">Delete {entityLabel}</DialogTitle>
            <DialogDescription className="text-text-secondary">
              Are you sure you want to delete this {entityLabelLower}? This action cannot be undone.
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
