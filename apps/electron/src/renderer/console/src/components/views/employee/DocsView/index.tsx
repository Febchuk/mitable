/**
 * DocsView — Redesigned
 *
 * Clean document list grouped by date, with a "New doc" button top-right.
 * Styled to match the new design system (dark canvas, Inter/Newsreader).
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useDocuments } from "@/console/src/hooks/queries/documents";
import { Loader2, AlertCircle, FileText, Plus, Lock } from "lucide-react";
import CreateDocumentModal from "./dialogs/CreateDocumentModal";
import { groupByDay } from "@/console/src/components/shared/groupByDay";
import type { Document } from "@mitable/shared";

function isReportDocument(doc: Document): boolean {
  return doc.tags?.includes("report") ?? false;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
}

function getDocInitial(doc: Document): string {
  return (doc.title || "U").charAt(0).toUpperCase();
}


export default function DocsView() {
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { data, isLoading, error } = useDocuments();
  const documents = (data?.documents || []).filter((doc) => !isReportDocument(doc));

  const sortedDocuments = useMemo(() => {
    return [...documents].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [documents]);

  const groupedDocuments = useMemo(
    () => groupByDay(sortedDocuments, (doc) => doc.updatedAt),
    [sortedDocuments]
  );

  if (isLoading) {
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
        <Loader2
          size={24}
          style={{ color: "var(--mi-accent)", animation: "spin 1s linear infinite" }}
        />
        <p style={{ color: "var(--text-tertiary)", fontSize: 13, marginTop: 12 }}>
          Loading docs...
        </p>
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
            Generate docs from your work context
          </p>
        </div>

        {/* New doc button */}
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
                  const creatorName = doc.creator
                    ? `${doc.creator.firstName} ${doc.creator.lastName}`.trim()
                    : "Unknown";

                  return (
                    <div
                      key={doc.id}
                      onClick={() => navigate(`/docs/${doc.id}`)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: 8,
                        cursor: "pointer",
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

                      {/* Title + author */}
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
                          {doc.title || "Untitled"}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text-tertiary)",
                            marginTop: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {creatorName}
                        </div>
                      </div>

                      {/* Status */}
                      {doc.status === "draft" && (
                        <Lock size={12} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                      )}

                      {/* Time */}
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-tertiary)",
                          flexShrink: 0,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatTime(doc.updatedAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty state — clean, no icon */
        <div style={{ paddingTop: 40 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "48px 0",
              borderRadius: 12,
              border: "0.5px dashed rgba(var(--ui-rgb), 0.1)",
            }}
          >
            <FileText size={20} style={{ color: "var(--text-tertiary)", marginBottom: 12 }} />
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 4,
              }}
            >
              No documents yet
            </p>
            <p
              style={{
                color: "var(--text-tertiary)",
                fontSize: 12,
                textAlign: "center",
                maxWidth: 260,
                lineHeight: 1.5,
              }}
            >
              Create your first document or generate one from a work session.
            </p>
          </div>
        </div>
      )}

      {/* Create Document Modal */}
      <CreateDocumentModal open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} />
    </div>
  );
}
