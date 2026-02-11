/**
 * ArtifactRow
 *
 * Horizontal artifact item for the timeline list.
 * Minimal design with status stripe accent.
 */

import { CSSProperties, useState } from "react";
import { ChevronRight, Trash2, Loader2, Check, Clock, AlertTriangle, Minus } from "lucide-react";
import type { Artifact, ExtractionStatus } from "@/console/src/services/artifactsService";
import { getLocale } from "@/console/src/lib/date";

interface ArtifactRowProps {
  artifact: Artifact;
  onClick: () => void;
  onDelete: () => void;
  style?: CSSProperties;
}

// File type display config
const FILE_TYPE_CONFIG: Record<string, { label: string; colorClass: string }> = {
  "application/pdf": { label: "PDF", colorClass: "text-red-400" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    label: "DOCX",
    colorClass: "text-blue-400",
  },
  "text/plain": { label: "TXT", colorClass: "text-ink-secondary" },
  "text/markdown": { label: "MD", colorClass: "text-ink-secondary" },
  "image/png": { label: "PNG", colorClass: "text-purple-400" },
  "image/jpeg": { label: "JPEG", colorClass: "text-purple-400" },
  "image/gif": { label: "GIF", colorClass: "text-purple-400" },
  "image/webp": { label: "WebP", colorClass: "text-purple-400" },
};

// Status config for extraction
const STATUS_CONFIG: Record<
  ExtractionStatus,
  { bgClass: string; textClass: string; icon: React.ReactNode; label: string }
> = {
  completed: {
    bgClass: "bg-emerald",
    textClass: "text-emerald",
    icon: <Check size={14} />,
    label: "Processed",
  },
  processing: {
    bgClass: "bg-indigo",
    textClass: "text-indigo",
    icon: <Loader2 size={14} className="animate-spin" />,
    label: "Processing",
  },
  pending: {
    bgClass: "bg-ink-tertiary",
    textClass: "text-ink-tertiary",
    icon: <Clock size={14} />,
    label: "Pending",
  },
  failed: {
    bgClass: "bg-red-400",
    textClass: "text-red-400",
    icon: <AlertTriangle size={14} />,
    label: "Failed",
  },
  skipped: {
    bgClass: "bg-ink-tertiary",
    textClass: "text-ink-tertiary",
    icon: <Minus size={14} />,
    label: "Skipped",
  },
};

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString(getLocale(), {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getFileTypeConfig(mimeType: string) {
  return FILE_TYPE_CONFIG[mimeType] || { label: "File", colorClass: "text-ink-tertiary" };
}

export default function ArtifactRow({ artifact, onClick, onDelete, style }: ArtifactRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fileTypeConfig = getFileTypeConfig(artifact.mimeType);
  const statusConfig = STATUS_CONFIG[artifact.extractionStatus] || STATUS_CONFIG.pending;

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showDeleteConfirm) {
      onDelete();
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
      // Auto-hide after 3 seconds
      setTimeout(() => setShowDeleteConfirm(false), 3000);
    }
  };

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowDeleteConfirm(false);
      }}
      style={style}
      className="group relative flex items-center gap-4 px-4 py-3.5 rounded-xl bg-canvas-overlay/50 border border-transparent cursor-pointer transition-all duration-200 hover:bg-canvas-overlay hover:border-stroke-subtle animate-reveal-up"
    >
      {/* Status Stripe */}
      <div
        className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-full ${statusConfig.bgClass}`}
      />

      {/* Time */}
      <span className="w-20 flex-shrink-0 pl-2 text-sm tabular-nums text-ink-secondary">
        {formatTime(artifact.createdAt)}
      </span>

      {/* Filename */}
      <h4 className="flex-1 min-w-0 text-[15px] font-medium text-ink-primary truncate group-hover:text-white transition-colors">
        {artifact.filename}
      </h4>

      {/* File Type Badge */}
      <span className={`text-xs font-medium w-16 ${fileTypeConfig.colorClass}`}>
        {fileTypeConfig.label}
      </span>

      {/* File Size */}
      <span className="text-sm text-ink-tertiary w-20 text-right tabular-nums">
        {artifact.fileSizeFormatted}
      </span>

      {/* Status Indicator */}
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${statusConfig.textClass} bg-current/10`}
        title={statusConfig.label}
      >
        {statusConfig.icon}
      </div>

      {/* Delete Button (shown on hover) */}
      {isHovered && (
        <button
          onClick={handleDeleteClick}
          className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
            showDeleteConfirm
              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              : "bg-canvas-muted text-ink-tertiary hover:text-red-400 hover:bg-red-500/10"
          }`}
          title={showDeleteConfirm ? "Click again to confirm" : "Delete artifact"}
        >
          <Trash2 size={14} />
        </button>
      )}

      {/* Arrow (when not showing delete) */}
      {!isHovered && (
        <ChevronRight
          size={16}
          className="text-ink-tertiary opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
        />
      )}
    </div>
  );
}
