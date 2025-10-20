import { useState, useRef } from "react";
import { Upload, Link as LinkIcon, Camera, X, File, ExternalLink } from "lucide-react";
import Button from "@/console/src/components/ui/Button";
import { NudgeResource } from "@/console/src/services/nudgesService";

interface ResourceUploaderProps {
  resources: NudgeResource[];
  onResourcesChange: (resources: NudgeResource[]) => void;
}

type TabType = "files" | "links" | "screenshots";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
];

export default function ResourceUploader({ resources, onResourcesChange }: ResourceUploaderProps) {
  const [activeTab, setActiveTab] = useState<TabType>("files");
  const [linkInput, setLinkInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `File "${file.name}" exceeds 10MB limit`;
    }
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return `File type "${file.type}" is not supported`;
    }
    return null;
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setError(null);
    const newResources: NudgeResource[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validationError = validateFile(file);

      if (validationError) {
        setError(validationError);
        continue;
      }

      // Convert file to base64 data URL for MVP
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        newResources.push({
          type: "file",
          url: dataUrl,
          filename: file.name,
          filesize: file.size,
        });

        // Update resources when all files are processed
        if (newResources.length === files.length - (error ? 1 : 0)) {
          onResourcesChange([...resources, ...newResources]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFilesSelected(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFilesSelected(e.target.files);
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const handleAddLink = () => {
    const trimmedLink = linkInput.trim();

    if (!trimmedLink) {
      setError("Please enter a URL");
      return;
    }

    // Basic URL validation
    if (!trimmedLink.startsWith("http://") && !trimmedLink.startsWith("https://")) {
      setError("URL must start with http:// or https://");
      return;
    }

    try {
      new URL(trimmedLink); // Validate URL format
      onResourcesChange([
        ...resources,
        {
          type: "link",
          url: trimmedLink,
        },
      ]);
      setLinkInput("");
      setError(null);
    } catch {
      setError("Please enter a valid URL");
    }
  };

  const handleRemoveResource = (index: number) => {
    onResourcesChange(resources.filter((_, i) => i !== index));
  };

  const fileResources = resources.filter((r) => r.type === "file");
  const linkResources = resources.filter((r) => r.type === "link");
  const screenshotResources = resources.filter((r) => r.type === "screenshot");

  return (
    <div className="space-y-4">
      {/* Tab Selector */}
      <div className="flex gap-2 bg-background-secondary p-1 rounded-lg">
        <button
          onClick={() => setActiveTab("files")}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "files"
              ? "bg-background-elevated text-text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Upload size={16} />
            <span>Files</span>
            {fileResources.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-primary text-white text-xs rounded-full">
                {fileResources.length}
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => setActiveTab("links")}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "links"
              ? "bg-background-elevated text-text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <LinkIcon size={16} />
            <span>Links</span>
            {linkResources.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-primary text-white text-xs rounded-full">
                {linkResources.length}
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => setActiveTab("screenshots")}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "screenshots"
              ? "bg-background-elevated text-text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Camera size={16} />
            <span>Screenshots</span>
            {screenshotResources.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-primary text-white text-xs rounded-full">
                {screenshotResources.length}
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-lg">
          <p className="text-sm text-status-error">{error}</p>
        </div>
      )}

      {/* Files Tab */}
      {activeTab === "files" && (
        <div className="space-y-4">
          {/* Drag and Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border-subtle hover:border-border"
            }`}
          >
            <Upload size={32} className="mx-auto mb-3 text-text-tertiary" />
            <p className="text-sm text-text-primary mb-1">
              Drag and drop files here, or click to browse
            </p>
            <p className="text-xs text-text-secondary mb-4">
              Max 10MB per file • PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, GIF
            </p>
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              Choose Files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALLOWED_FILE_TYPES.join(",")}
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>

          {/* Uploaded Files List */}
          {fileResources.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">Uploaded Files</p>
              {fileResources.map((resource, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-background-secondary rounded-lg border border-border-subtle"
                >
                  <div className="flex items-center justify-center w-10 h-10 bg-background-elevated rounded-lg">
                    <File size={20} className="text-text-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {resource.filename}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {resource.filesize ? formatFileSize(resource.filesize) : "Unknown size"}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveResource(resources.indexOf(resource))}
                    className="p-1.5 hover:bg-background-elevated rounded-md transition-colors"
                  >
                    <X size={16} className="text-text-secondary hover:text-text-primary" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Links Tab */}
      {activeTab === "links" && (
        <div className="space-y-4">
          {/* Link Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">Add Link</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={linkInput}
                onChange={(e) => {
                  setLinkInput(e.target.value);
                  setError(null);
                }}
                onKeyPress={(e) => e.key === "Enter" && handleAddLink()}
                placeholder="https://example.com/document"
                className="flex-1 bg-background-secondary text-text-primary placeholder-text-tertiary px-4 py-3 rounded-lg border border-border-subtle outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
              <Button variant="primary" size="md" onClick={handleAddLink}>
                Add
              </Button>
            </div>
            <p className="text-xs text-text-secondary">
              Add links to documentation, wiki pages, or external resources
            </p>
          </div>

          {/* Added Links List */}
          {linkResources.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">Added Links</p>
              {linkResources.map((resource, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-background-secondary rounded-lg border border-border-subtle"
                >
                  <div className="flex items-center justify-center w-10 h-10 bg-background-elevated rounded-lg">
                    <ExternalLink size={20} className="text-text-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline truncate block"
                    >
                      {resource.url}
                    </a>
                  </div>
                  <button
                    onClick={() => handleRemoveResource(resources.indexOf(resource))}
                    className="p-1.5 hover:bg-background-elevated rounded-md transition-colors"
                  >
                    <X size={16} className="text-text-secondary hover:text-text-primary" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Screenshots Tab */}
      {activeTab === "screenshots" && (
        <div className="space-y-4">
          <div className="text-center py-8">
            <Camera size={32} className="mx-auto mb-3 text-text-tertiary" />
            <p className="text-sm text-text-primary mb-2">Screenshot capture coming soon</p>
            <p className="text-xs text-text-secondary mb-4">
              This feature will allow you to capture and annotate screenshots to include with your
              nudge
            </p>
            <Button variant="secondary" size="md" disabled>
              <Camera size={16} className="mr-2" />
              Capture Screenshot
            </Button>
          </div>
        </div>
      )}

      {/* Total Resources Counter */}
      {resources.length > 0 && (
        <div className="pt-2 border-t border-border-subtle">
          <p className="text-xs text-text-secondary">
            {resources.length} resource{resources.length !== 1 ? "s" : ""} attached
          </p>
        </div>
      )}
    </div>
  );
}
