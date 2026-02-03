/**
 * UploadArtifactModal
 *
 * Modal dialog for uploading artifacts with drag-and-drop support.
 * Features:
 * - Drag-and-drop zone
 * - Multi-file upload support
 * - Per-file progress indicators
 * - File validation (type, size)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Upload, Check, AlertTriangle, Loader2, File } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUploadArtifact } from "@/console/src/hooks/queries/artifacts";

interface UploadArtifactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UploadingFile {
  id: string;
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

// Supported file types
const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".png", ".jpg", ".jpeg", ".gif", ".webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file: File): string | null {
  // Check file type
  if (!ACCEPTED_TYPES.includes(file.type)) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !ACCEPTED_EXTENSIONS.includes(`.${ext}`)) {
      return `Unsupported file type: ${file.type || ext || "unknown"}`;
    }
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return `File too large: ${formatFileSize(file.size)} (max ${formatFileSize(MAX_FILE_SIZE)})`;
  }

  return null;
}

export default function UploadArtifactModal({ open, onOpenChange }: UploadArtifactModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [completedCount, setCompletedCount] = useState(0);

  const { mutateAsync: uploadArtifact } = useUploadArtifact();

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setUploadingFiles([]);
      setCompletedCount(0);
      setIsDragging(false);
    }
  }, [open]);

  // Auto-close after all uploads complete successfully
  useEffect(() => {
    if (
      uploadingFiles.length > 0 &&
      uploadingFiles.every((f) => f.status === "success" || f.status === "error")
    ) {
      const allSuccess = uploadingFiles.every((f) => f.status === "success");
      if (allSuccess) {
        const timer = setTimeout(() => {
          onOpenChange(false);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [uploadingFiles, onOpenChange]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const newFiles: UploadingFile[] = files.map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        status: "pending" as const,
      }));

      setUploadingFiles((prev) => [...prev, ...newFiles]);

      // Upload each file sequentially
      for (const uploadFile of newFiles) {
        const validationError = validateFile(uploadFile.file);

        if (validationError) {
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === uploadFile.id ? { ...f, status: "error", error: validationError } : f
            )
          );
          continue;
        }

        // Mark as uploading
        setUploadingFiles((prev) =>
          prev.map((f) => (f.id === uploadFile.id ? { ...f, status: "uploading" } : f))
        );

        try {
          await uploadArtifact(uploadFile.file);
          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === uploadFile.id ? { ...f, status: "success" } : f))
          );
          setCompletedCount((c) => c + 1);
        } catch (error) {
          setUploadingFiles((prev) =>
            prev.map((f) =>
              f.id === uploadFile.id
                ? { ...f, status: "error", error: error instanceof Error ? error.message : "Upload failed" }
                : f
            )
          );
        }
      }
    },
    [uploadArtifact]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      handleFiles(files);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const isUploading = uploadingFiles.some((f) => f.status === "uploading");
  const hasErrors = uploadingFiles.some((f) => f.status === "error");
  const allDone =
    uploadingFiles.length > 0 &&
    uploadingFiles.every((f) => f.status === "success" || f.status === "error");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[480px] p-0 bg-canvas-base border-stroke-subtle overflow-hidden"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="font-display font-semibold text-ink-primary text-lg">
            Upload Artefact
          </h2>
          <button
            onClick={handleClose}
            className="p-2 -mr-2 rounded-lg text-ink-tertiary hover:text-ink-secondary hover:bg-canvas-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-2">
          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleBrowseClick}
            className={`relative flex flex-col items-center justify-center py-12 px-6 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
              isDragging
                ? "border-indigo bg-indigo/10"
                : "border-stroke-subtle bg-canvas-overlay/50 hover:border-indigo/40 hover:bg-canvas-overlay"
            }`}
          >
            <div
              className={`flex items-center justify-center w-14 h-14 rounded-2xl mb-4 transition-colors ${
                isDragging ? "bg-indigo/20" : "bg-canvas-muted"
              }`}
            >
              <Upload
                size={28}
                className={`transition-colors ${isDragging ? "text-indigo" : "text-ink-tertiary"}`}
              />
            </div>
            <p className="text-sm font-medium text-ink-primary mb-1">
              {isDragging ? "Drop files here" : "Drop files here or click to browse"}
            </p>
            <p className="text-xs text-ink-tertiary">
              PDF, DOCX, TXT, MD, PNG, JPEG · Max 10MB
            </p>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(",")}
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Upload Progress List */}
          {uploadingFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                  {isUploading ? "Uploading" : allDone ? "Complete" : "Files"}
                </h4>
                <span className="text-xs text-ink-tertiary tabular-nums">
                  {completedCount}/{uploadingFiles.length}
                </span>
              </div>

              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {uploadingFiles.map((uploadFile) => (
                  <div
                    key={uploadFile.id}
                    className="flex items-center gap-3 px-3 py-2.5 bg-canvas-overlay rounded-lg"
                  >
                    <File size={16} className="text-ink-tertiary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-primary truncate">{uploadFile.file.name}</p>
                      {uploadFile.error && (
                        <p className="text-xs text-red-400 truncate">{uploadFile.error}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {uploadFile.status === "pending" && (
                        <span className="text-xs text-ink-tertiary">Waiting...</span>
                      )}
                      {uploadFile.status === "uploading" && (
                        <Loader2 size={16} className="text-indigo animate-spin" />
                      )}
                      {uploadFile.status === "success" && (
                        <Check size={16} className="text-emerald" />
                      )}
                      {uploadFile.status === "error" && (
                        <AlertTriangle size={16} className="text-red-400" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 pb-6 pt-4">
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isUploading}
            className="text-ink-secondary hover:text-ink-primary"
          >
            {allDone && !hasErrors ? "Close" : "Cancel"}
          </Button>
          {allDone && hasErrors && (
            <Button
              onClick={() => {
                setUploadingFiles([]);
                setCompletedCount(0);
              }}
              variant="outline"
              className="border-stroke-subtle"
            >
              Try Again
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
