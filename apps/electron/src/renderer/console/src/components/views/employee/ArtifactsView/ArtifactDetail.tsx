/**
 * ArtifactDetail
 *
 * Detailed view of a single artifact with download, text preview, and delete options.
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useArtifact, useArtifactText, useDeleteArtifact } from "@/console/src/hooks/queries/artifacts";
import {
  ArrowLeft,
  Trash2,
  Download,
  Loader2,
  FileText,
  FileImage,
  File,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
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
import type { ExtractionStatus } from "@mitable/shared";

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

// Get status badge info
function getStatusBadge(status: ExtractionStatus) {
  switch (status) {
    case "completed":
      return {
        className: "bg-green-500/20 text-green-400 border-transparent",
        icon: CheckCircle2,
        label: "Text Extracted",
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
        label: "Extraction Failed",
      };
    case "skipped":
      return {
        className: "bg-gray-500/20 text-gray-400 border-transparent",
        icon: File,
        label: "No Text (Image)",
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

export default function ArtifactDetail() {
  const { artifactId } = useParams<{ artifactId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: artifact, isLoading } = useArtifact(artifactId || "");
  const { data: textData, isLoading: isLoadingText } = useArtifactText(artifactId || "");
  const deleteMutation = useDeleteArtifact();

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleDelete = async () => {
    if (!artifactId) return;

    try {
      await deleteMutation.mutateAsync(artifactId);
      navigate("/artifacts");
      toast({
        title: "Artifact deleted",
        description: "The artifact has been deleted.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete artifact.",
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    if (artifact?.downloadUrl) {
      window.open(artifact.downloadUrl, "_blank");
    } else if (artifact?.storageUrl) {
      window.open(artifact.storageUrl, "_blank");
    }
  };

  const handleCopyText = () => {
    if (textData?.extractedText) {
      navigator.clipboard.writeText(textData.extractedText);
      toast({
        title: "Copied",
        description: "Extracted text copied to clipboard.",
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

  if (!artifact) {
    return (
      <div className="p-8 text-center">
        <p className="text-text-secondary">Artifact not found</p>
        <Button variant="link" onClick={() => navigate("/artifacts")} className="mt-4">
          Back to artifacts
        </Button>
      </div>
    );
  }

  const FileIcon = getFileIcon(artifact.mimeType);
  const statusBadge = getStatusBadge(artifact.extractionStatus);
  const StatusIcon = statusBadge.icon;
  const isImage = artifact.mimeType.startsWith("image/");

  return (
    <div className="h-full flex flex-col app-no-drag">
      {/* Header */}
      <div className="flex items-start justify-between p-6 border-b border-border-subtle">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/artifacts")}
            className="text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={20} />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileIcon size={24} className="text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary">{artifact.filename}</h1>
              <div className="flex items-center gap-3 mt-1">
                <Badge className={`${statusBadge.className} gap-1`}>
                  <StatusIcon
                    size={12}
                    className={statusBadge.label === "Processing" ? "animate-spin" : ""}
                  />
                  {statusBadge.label}
                </Badge>
                <span className="text-sm text-text-secondary">
                  {formatFileSize(artifact.fileSizeBytes)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleDownload} className="gap-2">
            <Download size={16} />
            Download
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

      {/* Metadata */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b border-border-subtle bg-background-secondary/30">
        <div>
          <p className="text-xs text-text-tertiary uppercase mb-1">Type</p>
          <p className="text-sm text-text-primary">{artifact.mimeType}</p>
        </div>
        <div>
          <p className="text-xs text-text-tertiary uppercase mb-1">Size</p>
          <p className="text-sm text-text-primary">{formatFileSize(artifact.fileSizeBytes)}</p>
        </div>
        <div>
          <p className="text-xs text-text-tertiary uppercase mb-1">Uploaded</p>
          <p className="text-sm text-text-primary">
            {new Date(artifact.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
        {textData?.wordCount !== undefined && textData.wordCount > 0 && (
          <div>
            <p className="text-xs text-text-tertiary uppercase mb-1">Word Count</p>
            <p className="text-sm text-text-primary">{textData.wordCount.toLocaleString()}</p>
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden p-6">
        {isImage ? (
          // Image Preview
          <div className="h-full flex items-center justify-center bg-background-elevated rounded-lg border border-border-subtle">
            <img
              src={artifact.storageUrl}
              alt={artifact.filename}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        ) : (
          // Text Preview
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">Extracted Text</h2>
              {textData?.extractedText && (
                <Button variant="outline" size="sm" onClick={handleCopyText} className="gap-2">
                  <Copy size={14} />
                  Copy
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-auto bg-background-elevated rounded-lg border border-border-subtle p-4">
              {isLoadingText ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="animate-spin text-text-secondary" size={24} />
                </div>
              ) : textData?.extractedText ? (
                <pre className="text-sm text-text-primary whitespace-pre-wrap font-mono">
                  {textData.extractedText}
                </pre>
              ) : artifact.extractionStatus === "failed" ? (
                <div className="flex flex-col items-center justify-center h-full text-text-secondary">
                  <AlertCircle size={48} className="mb-4 text-status-error" />
                  <p className="text-lg font-medium mb-2">Text extraction failed</p>
                  {artifact.extractionError && (
                    <p className="text-sm">{artifact.extractionError}</p>
                  )}
                </div>
              ) : artifact.extractionStatus === "skipped" ? (
                <div className="flex flex-col items-center justify-center h-full text-text-secondary">
                  <FileImage size={48} className="mb-4" />
                  <p className="text-lg font-medium">No text to extract</p>
                  <p className="text-sm">Image files do not contain extractable text</p>
                </div>
              ) : artifact.extractionStatus === "pending" || artifact.extractionStatus === "processing" ? (
                <div className="flex flex-col items-center justify-center h-full text-text-secondary">
                  <Loader2 size={48} className="mb-4 animate-spin" />
                  <p className="text-lg font-medium">Extracting text...</p>
                  <p className="text-sm">This may take a moment</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-text-secondary">
                  <FileText size={48} className="mb-4" />
                  <p className="text-lg font-medium">No text available</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="bg-background-primary border-border-subtle">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Delete Artifact</DialogTitle>
            <DialogDescription className="text-text-secondary">
              Are you sure you want to delete "{artifact.filename}"? This action cannot be undone.
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
