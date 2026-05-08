/**
 * DocsView — Redesigned (Local)
 *
 * Clean document list grouped by date, with a "New doc" button top-right.
 * Styled to match the design system (dark canvas, Inter/Newsreader).
 * Data sourced from local SQLite via IPC instead of backend HTTP.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Plus, Trash2, CheckCircle, Clock } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import CreateDocumentModal from "./dialogs/CreateDocumentModal";

interface LocalDoc {
  id: string;
  userId: string;
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  pageCount: number;
  chunkCount: number;
  status: string;
  error: string | null;
  content?: string | null;
  title?: string | null;
  createdAt: number;
  updatedAt: number;
}

interface DateGroup {
  label: string;
  items: LocalDoc[];
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDocInitial(doc: LocalDoc): string {
  return doc.fileType.charAt(0).toUpperCase();
}

function groupByDay(docs: LocalDoc[]): DateGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;

  const groups = new Map<string, LocalDoc[]>();

  for (const doc of docs) {
    let label: string;
    if (doc.createdAt >= todayStart) label = "Today";
    else if (doc.createdAt >= yesterdayStart) label = "Yesterday";
    else {
      label = new Date(doc.createdAt).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    }
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(doc);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  ready: <CheckCircle size={12} style={{ color: "var(--status-success)" }} />,
  parsing: <Clock size={12} style={{ color: "var(--status-warning)" }} />,
  error: <AlertCircle size={12} style={{ color: "var(--status-error)" }} />,
};

export default function DocsView() {
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [documents, setDocuments] = useState<LocalDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    try {
      const result = await window.consoleAPI.localDocsList?.();
      setDocuments((result?.documents as LocalDoc[]) ?? []);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  // Poll while any doc is still parsing
  useEffect(() => {
    const hasPending = documents.some((d) => d.status === "parsing" || d.status === "pending");
    if (!hasPending) return;
    const interval = setInterval(loadDocs, 2000);
    return () => clearInterval(interval);
  }, [documents, loadDocs]);

  // Reload after modal closes (new doc may have been added)
  useEffect(() => {
    if (!isCreateModalOpen) loadDocs();
  }, [isCreateModalOpen, loadDocs]);

  const sortedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => b.createdAt - a.createdAt);
  }, [documents]);

  const groupedDocuments = useMemo(() => groupByDay(sortedDocuments), [sortedDocuments]);

  const handleDelete = async (docId: string) => {
    await window.consoleAPI.localDocsDelete?.(docId);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  };

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <div
          style={{
            width: 20,
            height: 20,
            border: "2px solid rgba(var(--ui-rgb), 0.1)",
            borderTopColor: "var(--text-tertiary)",
            borderRadius: "50%",
            animation: "spin 0.6s linear infinite",
          }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 0",
        }}
      >
        <AlertCircle size={24} style={{ color: "var(--status-error)", marginBottom: 12 }} />
        <p style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 500 }}>
          Failed to load documents
        </p>
      </div>
    );
  }

  return (
    <div className="app-no-drag" style={{ display: "flex", flexDirection: "column" }}>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 32,
              color: "var(--text-primary)",
              fontWeight: 400,
              letterSpacing: "-0.4px",
              lineHeight: 1,
              margin: 0,
            }}
          >
            Docs
          </h1>
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 15,
              color: "var(--text-tertiary)",
              fontWeight: 400,
              fontStyle: "italic",
              margin: "12px 0 0",
            }}
          >
            Your documents and imported files
          </p>
        </div>

        {/* New doc button — only shown when docs exist (empty state has its own CTA) */}
        {sortedDocuments.length > 0 && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 8,
              border: "var(--border-subtle)",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: 12,
              fontFamily: "var(--font-sans)",
              fontWeight: 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
              marginTop: 4,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.05)";
              e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.12)";
            }}
          >
            <Plus size={12} strokeWidth={2} />
            New
          </button>
        )}
      </div>

      {/* Document list */}
      {groupedDocuments.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {groupedDocuments.map((group) => (
            <div key={group.label}>
              {/* Date group header */}
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  fontWeight: 500,
                  marginBottom: 8,
                }}
              >
                {group.label}
              </div>

              {/* Document rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {group.items.map((doc) => {
                  const initial = getDocInitial(doc);

                  const hasContent = doc.fileType === "generated" || !!doc.content;

                  return (
                    <div
                      key={doc.id}
                      onClick={() => {
                        if (hasContent) navigate(`/docs/${doc.id}`);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: 8,
                        cursor: hasContent ? "pointer" : "default",
                        transition: "background 0.12s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.04)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      {/* Avatar */}
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 7,
                          background: "rgba(var(--ui-rgb), 0.06)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text-tertiary)",
                        }}
                      >
                        {initial}
                      </div>

                      {/* Title + meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--text-primary)",
                            fontWeight: 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {doc.title || doc.fileName}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text-tertiary)",
                            marginTop: 1,
                            display: "flex",
                            gap: 8,
                          }}
                        >
                          <span>{formatBytes(doc.fileSize)}</span>
                          {doc.chunkCount > 0 && <span>{doc.chunkCount} chunks</span>}
                          {doc.pageCount > 1 && <span>{doc.pageCount} pages</span>}
                        </div>
                      </div>

                      {/* Status */}
                      {STATUS_ICON[doc.status] ?? null}

                      {/* Time */}
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-tertiary)",
                          flexShrink: 0,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatTime(doc.createdAt)}
                      </span>

                      {/* Delete */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(doc.id);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 4,
                          borderRadius: 4,
                          color: "var(--text-tertiary)",
                          display: "flex",
                          transition: "color 0.12s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "var(--status-error)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--text-tertiary)";
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty state */
        <div style={{ paddingTop: 40 }}>
          <EmptyState
            title="No documents yet"
            description="Add a file or generate a document from your work sessions."
            actions={
              <button
                onClick={() => setIsCreateModalOpen(true)}
                style={{
                  height: 34,
                  padding: "0 16px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontFamily: "var(--font-sans)",
                  fontWeight: 500,
                  border: "none",
                  cursor: "pointer",
                  background: "#82C0CC",
                  color: "#1A1916",
                  transition: "opacity 0.15s",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Plus size={14} />
                Create your first doc
              </button>
            }
          />
        </div>
      )}

      {/* Create Document Modal */}
      <CreateDocumentModal open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} />
    </div>
  );
}
