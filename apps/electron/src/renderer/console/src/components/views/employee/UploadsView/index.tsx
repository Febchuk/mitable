/**
 * UploadsView — Redesigned
 *
 * Clean uploads list grouped by date, matching DocsView layout.
 * Upload button top-right, each row shows file info with delete.
 */

import { useState, useRef, useMemo } from "react";
import { Loader2, AlertCircle, Plus, Trash2, Check, Clock } from "lucide-react";
import { useArtifacts } from "../../../../hooks/queries/artifacts";
import { useUploadArtifact } from "../../../../hooks/queries/artifacts";
import { useDeleteArtifact } from "../../../../hooks/queries/artifacts";
import type { Artifact } from "../../../../services/artifactsService";

function groupArtifactsByDate(artifacts: Artifact[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; artifacts: Artifact[] }[] = [
    { label: "Today", artifacts: [] },
    { label: "Yesterday", artifacts: [] },
    { label: "This week", artifacts: [] },
    { label: "Earlier", artifacts: [] },
  ];

  artifacts.forEach((a) => {
    const d = new Date(a.createdAt);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (day.getTime() >= today.getTime()) groups[0].artifacts.push(a);
    else if (day.getTime() >= yesterday.getTime()) groups[1].artifacts.push(a);
    else if (day.getTime() >= weekAgo.getTime()) groups[2].artifacts.push(a);
    else groups[3].artifacts.push(a);
  });

  return groups.filter((g) => g.artifacts.length > 0);
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  completed: { label: "Ready", color: "var(--status-success)" },
  processing: { label: "Processing", color: "var(--status-warning)" },
  pending: { label: "Pending", color: "var(--text-tertiary)" },
  failed: { label: "Failed", color: "var(--status-error)" },
  skipped: { label: "Skipped", color: "var(--text-tertiary)" },
};

const EXT_COLORS: Record<string, string> = {
  pdf: "var(--status-error)",
  doc: "var(--status-info)",
  docx: "var(--status-info)",
  txt: "var(--text-secondary)",
  md: "var(--text-secondary)",
  csv: "var(--status-success)",
  json: "var(--status-warning)",
};

function getExtColor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return EXT_COLORS[ext] || "var(--mi-accent)";
}

function getExtLabel(filename: string): string {
  const ext = filename.split(".").pop()?.toUpperCase() || "?";
  return ext.length > 4 ? ext.slice(0, 3) : ext;
}

export default function UploadsView() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading, error } = useArtifacts();
  const artifacts = data?.artifacts || [];
  const uploadMutation = useUploadArtifact();
  const deleteMutation = useDeleteArtifact();

  const sortedArtifacts = useMemo(() => {
    return [...artifacts].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [artifacts]);

  const groupedArtifacts = useMemo(() => groupArtifactsByDate(sortedArtifacts), [sortedArtifacts]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadMutation.mutateAsync(file);
    } catch {
      console.error("[UploadsView] Upload failed");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync(id);
    } catch {
      console.error("[UploadsView] Delete failed");
    }
    setDeletingId(null);
  };

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
        <p style={{ color: "var(--text-tertiary)", fontSize: 13, marginTop: 12 }}>Loading uploads...</p>
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
        <p style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 500 }}>Failed to load uploads</p>
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
            Uploads
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
            Files Mitable uses as context, alongside your activity data
          </p>
        </div>

        {/* Upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
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
            cursor: uploadMutation.isPending ? "default" : "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.15s ease",
            marginTop: 4,
            opacity: uploadMutation.isPending ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!uploadMutation.isPending) {
              e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.05)";
              e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.2)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.12)";
          }}
        >
          {uploadMutation.isPending ? (
            <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Plus size={12} strokeWidth={2} />
          )}
          {uploadMutation.isPending ? "Uploading..." : "Upload"}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          onChange={handleUpload}
          style={{ display: "none" }}
          accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.png,.jpg,.jpeg"
        />
      </div>

      {/* File list */}
      {groupedArtifacts.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {groupedArtifacts.map((group) => (
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

              {/* Artifact rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {group.artifacts.map((artifact) => {
                  const color = getExtColor(artifact.filename);
                  const ext = getExtLabel(artifact.filename);
                  const status = STATUS_LABELS[artifact.extractionStatus] || STATUS_LABELS.pending;
                  const isDeleting = deletingId === artifact.id;

                  return (
                    <div
                      key={artifact.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: 8,
                        transition: "background 0.12s ease",
                        opacity: isDeleting ? 0.4 : 1,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.04)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      {/* File type badge */}
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 7,
                          background: `${color}20`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontSize: 9,
                          fontWeight: 700,
                          color: color,
                          letterSpacing: "0.03em",
                          textTransform: "uppercase",
                        }}
                      >
                        {ext}
                      </div>

                      {/* Filename + size */}
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
                          {artifact.filename}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text-tertiary)",
                            marginTop: 1,
                          }}
                        >
                          {artifact.fileSizeFormatted}
                        </div>
                      </div>

                      {/* Extraction status */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          flexShrink: 0,
                        }}
                      >
                        {artifact.extractionStatus === "completed" ? (
                          <Check size={11} style={{ color: status.color }} />
                        ) : artifact.extractionStatus === "processing" ? (
                          <Loader2
                            size={11}
                            style={{ color: status.color, animation: "spin 1s linear infinite" }}
                          />
                        ) : artifact.extractionStatus === "failed" ? (
                          <AlertCircle size={11} style={{ color: status.color }} />
                        ) : (
                          <Clock size={11} style={{ color: status.color }} />
                        )}
                        <span style={{ fontSize: 11, color: status.color }}>{status.label}</span>
                      </div>

                      {/* Time */}
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-tertiary)",
                          flexShrink: 0,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatTime(artifact.createdAt)}
                      </span>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(artifact.id)}
                        disabled={isDeleting}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 5,
                          border: "none",
                          background: "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: isDeleting ? "default" : "pointer",
                          color: "var(--text-tertiary)",
                          opacity: 0.5,
                          transition: "opacity 0.15s ease, color 0.15s ease",
                          flexShrink: 0,
                        }}
                        onMouseEnter={(e) => {
                          if (!isDeleting) {
                            e.currentTarget.style.opacity = "1";
                            e.currentTarget.style.color = "var(--status-error)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = "0.5";
                          e.currentTarget.style.color = "var(--text-tertiary)";
                        }}
                      >
                        <Trash2 size={12} strokeWidth={1.5} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
