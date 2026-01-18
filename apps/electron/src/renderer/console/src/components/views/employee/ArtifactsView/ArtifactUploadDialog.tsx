/**
 * ArtifactUploadDialog
 *
 * Dialog for uploading artifact files with drag-and-drop support.
 */

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUploadArtifact } from "@/console/src/hooks/queries/artifacts";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileText,
  FileImage,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ArtifactUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Allowed file types
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".png", ".jpg", ".jpeg", ".gif", ".webp"];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface SelectedFile {
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

export default function ArtifactUploadDialog({
  open,
  onOpenChange,
}: ArtifactUploadDialogProps) {
  const { toast } = useToast();
  const uploadArtifact = useUploadArtifact();

  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Validate file
  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size: ${formatFileSize(MAX_FILE_SIZE)}`;
    }
    return null;
  };

  // Add files to selection
  const addFiles = useCallback((files: FileList | File[]) => {
    const newFiles: SelectedFile[] = [];
    Array.from(files).forEach((file) => {
      const error = validateFile(file);
      newFiles.push({
        file,
        status: error ? "error" : "pending",
        error: error || undefined,
      });
    });
    setSelectedFiles((prev) => [...prev, ...newFiles]);
  }, []);

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files?.length) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  // Handle file input change
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        addFiles(e.target.files);
      }
      // Reset input value to allow selecting the same file again
      e.target.value = "";
    },
    [addFiles]
  );

  // Remove file from selection
  const removeFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Upload all pending files
  const uploadAll = async () => {
    const pendingFiles = selectedFiles.filter((f) => f.status === "pending");

    for (let i = 0; i < pendingFiles.length; i++) {
      const fileIndex = selectedFiles.findIndex(
        (f) => f.file === pendingFiles[i].file && f.status === "pending"
      );
      if (fileIndex === -1) continue;

      // Mark as uploading
      setSelectedFiles((prev) =>
        prev.map((f, idx) => (idx === fileIndex ? { ...f, status: "uploading" } : f))
      );

      try {
        await uploadArtifact.mutateAsync(pendingFiles[i].file);
        // Mark as success
        setSelectedFiles((prev) =>
          prev.map((f, idx) => (idx === fileIndex ? { ...f, status: "success" } : f))
        );
      } catch (error) {
        // Mark as error
        setSelectedFiles((prev) =>
          prev.map((f, idx) =>
            idx === fileIndex
              ? {
                  ...f,
                  status: "error",
                  error: error instanceof Error ? error.message : "Upload failed",
                }
              : f
          )
        );
      }
    }

    // Show toast with results
    const successful = selectedFiles.filter((f) => f.status === "success").length + pendingFiles.length;
    const failed = selectedFiles.filter((f) => f.status === "error").length;

    if (successful > 0 && failed === 0) {
      toast({
        title: "Upload complete",
        description: `${successful} file${successful > 1 ? "s" : ""} uploaded successfully`,
      });
      // Close dialog after brief delay
      setTimeout(() => {
        onOpenChange(false);
        setSelectedFiles([]);
      }, 1000);
    } else if (failed > 0) {
      toast({
        title: "Upload completed with errors",
        description: `${successful} succeeded, ${failed} failed`,
        variant: "destructive",
      });
    }
  };

  // Check if we can upload
  const canUpload = selectedFiles.some((f) => f.status === "pending");
  const isUploading = selectedFiles.some((f) => f.status === "uploading");

  // Handle dialog close
  const handleOpenChange = (newOpen: boolean) => {
    if (!isUploading) {
      onOpenChange(newOpen);
      if (!newOpen) {
        setSelectedFiles([]);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Artifact</DialogTitle>
          <DialogDescription>
            Upload files to use as source material for document generation.
            Supported: PDF, DOCX, TXT, PNG, JPG, GIF (max 10MB)
          </DialogDescription>
        </DialogHeader>

        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border-subtle hover:border-primary/50"
          )}
        >
          <Upload
            className={cn(
              "w-12 h-12 mx-auto mb-4",
              isDragging ? "text-primary" : "text-text-secondary"
            )}
          />
          <p className="text-text-primary mb-2">
            Drag and drop files here, or{" "}
            <label className="text-primary cursor-pointer hover:underline">
              browse
              <input
                type="file"
                multiple
                accept={ALLOWED_EXTENSIONS.join(",")}
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </p>
          <p className="text-xs text-text-secondary">
            {ALLOWED_EXTENSIONS.join(", ")} up to {formatFileSize(MAX_FILE_SIZE)}
          </p>
        </div>

        {/* Selected Files List */}
        {selectedFiles.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {selectedFiles.map((item, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border",
                  item.status === "error"
                    ? "bg-red-500/10 border-red-500/30"
                    : item.status === "success"
                      ? "bg-green-500/10 border-green-500/30"
                      : "bg-background-elevated border-border-subtle"
                )}
              >
                {/* Icon */}
                {item.file.type.startsWith("image/") ? (
                  <FileImage size={20} className="text-text-secondary flex-shrink-0" />
                ) : (
                  <FileText size={20} className="text-text-secondary flex-shrink-0" />
                )}

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">{item.file.name}</p>
                  <p className="text-xs text-text-secondary">
                    {formatFileSize(item.file.size)}
                    {item.error && (
                      <span className="text-red-400 ml-2">• {item.error}</span>
                    )}
                  </p>
                </div>

                {/* Status/Action */}
                {item.status === "uploading" && (
                  <Loader2 size={18} className="text-primary animate-spin flex-shrink-0" />
                )}
                {item.status === "success" && (
                  <CheckCircle2 size={18} className="text-green-400 flex-shrink-0" />
                )}
                {item.status === "error" && (
                  <AlertCircle size={18} className="text-red-400 flex-shrink-0" />
                )}
                {item.status === "pending" && (
                  <button
                    onClick={() => removeFile(index)}
                    className="text-text-secondary hover:text-text-primary flex-shrink-0"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            onClick={uploadAll}
            disabled={!canUpload || isUploading}
            className="gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload size={18} />
                Upload {selectedFiles.filter((f) => f.status === "pending").length || ""} File
                {selectedFiles.filter((f) => f.status === "pending").length !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
