/**
 * LocalDocDetail
 *
 * Local-only version of DocDetail. Uses IPC calls to localDb
 * instead of backend API. Supports editing, autosave, PDF export,
 * AI revision panel, and delete.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { createLogger } from "../../../../../../lib/logger";
import { getLocale } from "@/console/src/lib/date";

const logger = createLogger("LocalDocDetail");

import { marked } from "marked";
import DOMPurify from "dompurify";
import { ArrowLeft, Trash2, Loader2, CheckCircle, Download, Sparkles } from "lucide-react";
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
import DocDetailSkeleton from "./DocDetailSkeleton";

interface LocalDoc {
  id: string;
  userId: string;
  fileName: string;
  fileType: string;
  content: string | null;
  title: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
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

export default function LocalDocDetail() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [document, setDocument] = useState<LocalDoc | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [title, setTitle] = useState("");
  const [isAIEditMode, setIsAIEditMode] = useState(false);
  const latestContentRef = useRef<string>("");
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const titleSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const contentSaveTimeout = useRef<NodeJS.Timeout | null>(null);

  const loadDocument = useCallback(async () => {
    if (!docId) return;
    setIsLoading(true);
    try {
      const result = await window.consoleAPI.localDocsGet?.(docId);
      if (result?.document) {
        const doc = result.document as LocalDoc;
        setDocument(doc);
        setTitle(doc.title || doc.fileName || "Untitled");
        setLastSaved(new Date(doc.updatedAt));
        latestContentRef.current = doc.content || "";
      }
    } catch (err) {
      logger.error("Failed to load document:", err);
    } finally {
      setIsLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = "auto";
      titleRef.current.style.height = titleRef.current.scrollHeight + "px";
    }
  }, [title]);

  useEffect(() => {
    return () => {
      if (titleSaveTimeout.current) clearTimeout(titleSaveTimeout.current);
      if (contentSaveTimeout.current) clearTimeout(contentSaveTimeout.current);
    };
  }, []);

  const saveToIpc = useCallback(
    async (data: { content?: string; title?: string }) => {
      if (!docId) return;
      setIsSaving(true);
      try {
        await window.consoleAPI.localDocsUpdate?.(docId, data);
        setLastSaved(new Date());
      } catch (err) {
        logger.error("Autosave failed:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [docId]
  );

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setTitle(newTitle);
      if (titleSaveTimeout.current) clearTimeout(titleSaveTimeout.current);
      titleSaveTimeout.current = setTimeout(() => {
        saveToIpc({ title: newTitle });
      }, 1000);
    },
    [saveToIpc]
  );

  const handleContentChange = useCallback(
    (newContent: string) => {
      latestContentRef.current = newContent;
      if (contentSaveTimeout.current) clearTimeout(contentSaveTimeout.current);
      contentSaveTimeout.current = setTimeout(() => {
        saveToIpc({ content: newContent });
      }, 2000);
    },
    [saveToIpc]
  );

  const handleSave = useCallback(
    async (contentToSave: string) => {
      if (titleSaveTimeout.current) clearTimeout(titleSaveTimeout.current);
      if (contentSaveTimeout.current) clearTimeout(contentSaveTimeout.current);

      setIsSaving(true);
      try {
        await window.consoleAPI.localDocsUpdate?.(docId!, {
          title,
          content: contentToSave,
        });
        setLastSaved(new Date());
      } catch (err) {
        logger.error("Manual save failed:", err);
        toast({
          title: "Save failed",
          description: "Failed to save document.",
          variant: "destructive",
        });
      } finally {
        setIsSaving(false);
      }
    },
    [docId, title, toast]
  );

  const handleRevise = async (instruction: string, currentContent: string) => {
    const result = await window.consoleAPI.localDocsRevise?.(instruction, currentContent);
    if (result?.error) throw new Error(result.error);
    return { suggestion: result?.suggestion || "" };
  };

  const handleSaveFromAIEditor = async (editedContent: string) => {
    if (!docId) return;
    await window.consoleAPI.localDocsUpdate?.(docId, { content: editedContent });
    setLastSaved(new Date());
    setIsAIEditMode(false);
    loadDocument();
  };

  const handleDelete = async () => {
    if (!docId) return;
    setIsDeleting(true);
    try {
      await window.consoleAPI.localDocsDelete?.(docId);
      navigate("/docs");
      toast({ title: "Document deleted", description: "The document has been deleted." });
    } catch {
      toast({ title: "Error", description: "Failed to delete document.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!document) return;
    const content = latestContentRef.current || document.content || "";
    const rawHtml = await marked.parse(content);
    const html = DOMPurify.sanitize(rawHtml);
    const result = await window.consoleAPI.exportPdf(html, title || "Document");
    if (result?.success) {
      toast({ title: "PDF exported", description: "Document saved as PDF." });
    } else if (result && !result.success && result.error) {
      toast({ title: "Export failed", description: result.error, variant: "destructive" });
    }
  };

  if (isAIEditMode && (document?.content || latestContentRef.current)) {
    return (
      <AIEditPanel
        title="Edit Document"
        subtitle={title || "Document"}
        initialContent={latestContentRef.current || document?.content || ""}
        onSave={handleSaveFromAIEditor}
        onAutoSave={async (content: string) => {
          if (!docId) return;
          await window.consoleAPI.localDocsUpdate?.(docId, { content });
        }}
        onCancel={() => setIsAIEditMode(false)}
        onRevise={handleRevise}
        placeholder="Edit your document content..."
        contextLabel="document"
        documentId={docId}
      />
    );
  }

  if (isLoading) {
    return <DocDetailSkeleton />;
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

  return (
    <div className="h-full app-no-drag" style={{ overflow: "auto" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 24px 96px" }}>
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 32,
          }}
        >
          <button
            onClick={() => navigate("/docs")}
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
            {/* AI Edit */}
            <button
              onClick={() => setIsAIEditMode(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 12px",
                borderRadius: 8,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "rgba(var(--ui-rgb), 0.08)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: 13,
                fontFamily: "var(--font-sans)",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <Sparkles size={14} />
              AI Edit
            </button>

            {/* Export PDF */}
            <button
              onClick={handleExportPdf}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 12px",
                borderRadius: 8,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "rgba(var(--ui-rgb), 0.08)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: 13,
                fontFamily: "var(--font-sans)",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <Download size={14} />
              PDF
            </button>

            {/* Delete */}
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
          </div>
        </div>

        {/* Title */}
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

        {/* Metadata */}
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
          <span style={{ color: "var(--text-secondary)" }}>
            {new Date(document.updatedAt).toLocaleDateString(getLocale(), {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
          <span style={{ color: "#4A473F" }}>&middot;</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            {isSaving ? (
              <>
                <Loader2 size={11} className="animate-spin" />
                Saving&hellip;
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

        {/* Editor */}
        <DocEditor
          key={docId}
          initialContent={stripLeadingTitle(document.content || "")}
          onChange={handleContentChange}
          onSave={handleSave}
          documentId={docId}
          variant="fullWidth"
          placeholder="Start writing..."
          autosaveDelay={3000}
          className="min-h-[520px]"
        />
      </div>

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
              disabled={isDeleting}
              className="bg-status-error text-white hover:bg-status-error/90"
            >
              {isDeleting ? (
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
