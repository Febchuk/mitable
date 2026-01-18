/**
 * ArtifactsView
 *
 * Main view for managing uploaded artifacts (PDFs, DOCX, images).
 * Artifacts serve as source material for document generation.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useArtifacts } from "@/console/src/hooks/queries/artifacts";
import { Search, Upload, Paperclip } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ArtifactCard from "./ArtifactCard";
import ArtifactUploadDialog from "./ArtifactUploadDialog";

export default function ArtifactsView() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);

  const { data, isLoading, error } = useArtifacts();

  // Filter artifacts by search query
  const artifacts = (data?.artifacts || []).filter((artifact) =>
    searchQuery
      ? artifact.filename.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-center text-text-secondary">Loading artifacts...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="text-center text-status-error">Error loading artifacts</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 app-no-drag">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-text-primary">Artifacts</h1>
          <p className="text-text-secondary mt-2">
            Upload and manage source materials for document generation
          </p>
        </div>
        <Button
          onClick={() => setIsUploadDialogOpen(true)}
          className="gap-2 bg-primary text-white hover:bg-primary/90"
        >
          <Upload size={20} />
          Upload Artifact
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
          size={20}
        />
        <Input
          placeholder="Search artifacts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-12 bg-background-elevated border-transparent text-text-primary placeholder:text-text-secondary"
        />
      </div>

      {/* Artifacts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {artifacts.map((artifact) => (
          <ArtifactCard
            key={artifact.id}
            artifact={artifact}
            onClick={() => navigate(`/artifacts/${artifact.id}`)}
          />
        ))}
      </div>

      {/* Empty State */}
      {artifacts.length === 0 && (
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <Paperclip size={32} className="text-primary" />
          </div>
          <h3 className="text-xl font-semibold text-text-primary mb-2">
            {searchQuery ? "No artifacts found" : "No artifacts yet"}
          </h3>
          <p className="text-text-secondary mb-6 max-w-md mx-auto">
            {searchQuery
              ? "No artifacts match your search"
              : "Upload PDFs, documents, or images to use as source material when generating documentation."}
          </p>
          {!searchQuery && (
            <Button
              onClick={() => setIsUploadDialogOpen(true)}
              className="gap-2 bg-primary text-white hover:bg-primary/90"
            >
              <Upload size={20} />
              Upload Artifact
            </Button>
          )}
        </div>
      )}

      {/* Upload Dialog */}
      <ArtifactUploadDialog
        open={isUploadDialogOpen}
        onOpenChange={setIsUploadDialogOpen}
      />
    </div>
  );
}
