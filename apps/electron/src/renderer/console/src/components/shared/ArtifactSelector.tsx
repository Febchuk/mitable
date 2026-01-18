/**
 * ArtifactSelector
 *
 * A multi-select component for choosing artifacts.
 * Used in GenerateDocDialog for including artifacts in document generation.
 */

import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useArtifacts } from "@/console/src/hooks/queries/artifacts";
import {
  Search,
  FileText,
  FileImage,
  File,
  CheckCircle,
  Plus,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ExtractionStatus } from "@mitable/shared";

interface ArtifactSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  maxHeight?: string;
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

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Format relative date
function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Get status info
function getStatusInfo(status: ExtractionStatus) {
  switch (status) {
    case "completed":
      return { color: "text-green-400", icon: CheckCircle, label: "Ready" };
    case "processing":
      return { color: "text-blue-400", icon: Clock, label: "Processing" };
    case "pending":
      return { color: "text-yellow-400", icon: Clock, label: "Pending" };
    case "failed":
      return { color: "text-red-400", icon: AlertCircle, label: "Failed" };
    default:
      return { color: "text-gray-400", icon: File, label: "Unknown" };
  }
}

export default function ArtifactSelector({
  selectedIds,
  onChange,
  maxHeight = "200px",
}: ArtifactSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { data, isLoading } = useArtifacts();

  const artifacts = data?.artifacts || [];

  // Filter artifacts by search query
  const filteredArtifacts = useMemo(() => {
    if (!searchQuery) return artifacts;

    const query = searchQuery.toLowerCase();
    return artifacts.filter((a) => a.filename.toLowerCase().includes(query));
  }, [artifacts, searchQuery]);

  // Toggle artifact selection
  const toggleArtifact = (artifactId: string) => {
    if (selectedIds.includes(artifactId)) {
      onChange(selectedIds.filter((id) => id !== artifactId));
    } else {
      onChange([...selectedIds, artifactId]);
    }
  };

  if (isLoading) {
    return (
      <div className="h-24 flex items-center justify-center text-text-secondary">
        Loading artifacts...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with Search */}
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-xs">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            size={16}
          />
          <Input
            placeholder="Search artifacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-background-elevated border-border-subtle text-sm"
          />
        </div>
        <Link
          to="/artifacts"
          className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
        >
          <Plus size={14} />
          Upload more
        </Link>
      </div>

      {/* Selection Count */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {selectedIds.length} artifact{selectedIds.length !== 1 ? "s" : ""} selected
          </Badge>
        </div>
      )}

      {/* Artifacts List */}
      <ScrollArea style={{ maxHeight }} className="border border-border-subtle rounded-lg">
        {filteredArtifacts.length === 0 ? (
          <div className="p-8 text-center">
            {artifacts.length === 0 ? (
              <div className="space-y-3">
                <File size={32} className="mx-auto text-text-tertiary" />
                <div>
                  <p className="text-text-secondary text-sm">No artifacts uploaded</p>
                  <Link
                    to="/artifacts"
                    className="text-primary text-sm hover:underline inline-flex items-center gap-1 mt-1"
                  >
                    <Plus size={14} />
                    Upload artifacts
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-text-secondary text-sm">No artifacts match your search</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {filteredArtifacts.map((artifact) => {
              const isSelected = selectedIds.includes(artifact.id);
              const FileIcon = getFileIcon(artifact.mimeType);
              const status = getStatusInfo(artifact.extractionStatus);
              const StatusIcon = status.icon;

              return (
                <label
                  key={artifact.id}
                  className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-background-secondary/50 transition-colors ${
                    isSelected ? "bg-primary/5" : ""
                  }`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleArtifact(artifact.id)}
                    className="mt-1"
                  />
                  <div className="w-8 h-8 rounded bg-background-tertiary flex items-center justify-center flex-shrink-0">
                    <FileIcon size={16} className="text-text-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {artifact.filename}
                      </span>
                      <StatusIcon size={12} className={status.color} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-text-secondary">
                      <span>{formatFileSize(artifact.fileSizeBytes)}</span>
                      <span>•</span>
                      <span>{formatRelativeDate(artifact.createdAt)}</span>
                    </div>
                    {artifact.textPreview && (
                      <p className="text-xs text-text-tertiary mt-1 line-clamp-1">
                        {artifact.textPreview}
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <CheckCircle size={16} className="text-primary flex-shrink-0" />
                  )}
                </label>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Helper text */}
      <p className="text-xs text-text-tertiary">
        Optional: Select artifacts to include as additional source material
      </p>
    </div>
  );
}
