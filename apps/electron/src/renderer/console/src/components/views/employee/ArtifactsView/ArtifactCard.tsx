/**
 * ArtifactCard
 *
 * Card component for displaying an artifact in the grid view.
 */

import {
  FileText,
  FileImage,
  File,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Artifact, ExtractionStatus } from "@mitable/shared";

interface ArtifactCardProps {
  artifact: Artifact;
  onClick: () => void;
}

// Get icon based on mime type
function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return FileImage;
  }
  if (
    mimeType === "application/pdf" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "text/plain" ||
    mimeType === "text/markdown"
  ) {
    return FileText;
  }
  return File;
}

// Get status badge color and icon
function getStatusBadge(status: ExtractionStatus) {
  switch (status) {
    case "completed":
      return {
        className: "bg-green-500/20 text-green-400 border-transparent",
        icon: CheckCircle2,
        label: "Ready",
      };
    case "processing":
      return {
        className: "bg-blue-500/20 text-blue-400 border-transparent",
        icon: Loader2,
        label: "Processing",
      };
    case "pending":
      return {
        className: "bg-yellow-500/20 text-yellow-400 border-transparent",
        icon: Clock,
        label: "Pending",
      };
    case "failed":
      return {
        className: "bg-red-500/20 text-red-400 border-transparent",
        icon: AlertCircle,
        label: "Failed",
      };
    case "skipped":
      return {
        className: "bg-gray-500/20 text-gray-400 border-transparent",
        icon: File,
        label: "Skipped",
      };
    default:
      return {
        className: "bg-gray-500/20 text-gray-400 border-transparent",
        icon: File,
        label: "Unknown",
      };
  }
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? "just now" : `${diffMins} minutes ago`;
    }
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ArtifactCard({ artifact, onClick }: ArtifactCardProps) {
  const FileIcon = getFileIcon(artifact.mimeType);
  const statusBadge = getStatusBadge(artifact.extractionStatus);
  const StatusIcon = statusBadge.icon;

  // Get file extension
  const extension = artifact.filename.split(".").pop()?.toUpperCase() || "";

  return (
    <div
      onClick={onClick}
      className="bg-background-elevated rounded-lg border border-border-subtle p-4 cursor-pointer hover:border-primary/50 transition-colors group"
    >
      {/* Icon and Status */}
      <div className="flex items-start justify-between mb-3">
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FileIcon size={24} className="text-primary" />
        </div>
        <Badge className={`${statusBadge.className} gap-1`}>
          <StatusIcon
            size={12}
            className={statusBadge.label === "Processing" ? "animate-spin" : ""}
          />
          {statusBadge.label}
        </Badge>
      </div>

      {/* Filename */}
      <h3
        className="text-sm font-medium text-text-primary truncate group-hover:text-primary transition-colors mb-1"
        title={artifact.filename}
      >
        {artifact.filename}
      </h3>

      {/* Metadata Row */}
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <span className="uppercase font-medium text-text-secondary/70">{extension}</span>
        <span>•</span>
        <span>{formatFileSize(artifact.fileSizeBytes)}</span>
        <span>•</span>
        <span>{formatRelativeTime(artifact.createdAt)}</span>
      </div>

      {/* Text Preview (if available) */}
      {artifact.textPreview && (
        <p className="mt-3 text-xs text-text-secondary line-clamp-2 border-t border-border-subtle pt-3">
          {artifact.textPreview}
        </p>
      )}
    </div>
  );
}
