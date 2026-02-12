/**
 * ArtifactsView - Main artifacts list view
 *
 * Main view for uploaded artifacts (PDFs, DOCX, TXT, images).
 * Features a hero section and chronological timeline of artifacts.
 * Uses variant labels for Nigeria-specific terminology (Uploads vs Artefacts).
 */

import { useState, useMemo } from "react";
import { useArtifacts, useDeleteArtifact } from "@/console/src/hooks/queries/artifacts";
import { Search, Paperclip, Plus, ChevronRight, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ArtifactRow from "./ArtifactRow";
import UploadArtifactModal from "./dialogs/UploadArtifactModal";
import { useVariant } from "@/console/src/context/VariantContext";
import type { Artifact } from "@/console/src/services/artifactsService";

type FileTypeFilter = "all" | "pdf" | "docx" | "txt" | "image";

// Map filter values to mime types
const FILE_TYPE_MIME_MAP: Record<FileTypeFilter, string[] | null> = {
  all: null,
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  txt: ["text/plain", "text/markdown"],
  image: ["image/png", "image/jpeg", "image/gif", "image/webp"],
};

// Group artifacts by date category
function groupArtifactsByDate(artifacts: Artifact[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; artifacts: Artifact[] }[] = [
    { label: "Today", artifacts: [] },
    { label: "Yesterday", artifacts: [] },
    { label: "This Week", artifacts: [] },
    { label: "Earlier", artifacts: [] },
  ];

  artifacts.forEach((artifact) => {
    const artifactDate = new Date(artifact.createdAt);
    const artifactDay = new Date(
      artifactDate.getFullYear(),
      artifactDate.getMonth(),
      artifactDate.getDate()
    );

    if (artifactDay.getTime() >= today.getTime()) {
      groups[0].artifacts.push(artifact);
    } else if (artifactDay.getTime() >= yesterday.getTime()) {
      groups[1].artifacts.push(artifact);
    } else if (artifactDay.getTime() >= weekAgo.getTime()) {
      groups[2].artifacts.push(artifact);
    } else {
      groups[3].artifacts.push(artifact);
    }
  });

  return groups.filter((g) => g.artifacts.length > 0);
}

export default function ArtifactsView() {
  const { labels } = useVariant();
  const [searchQuery, setSearchQuery] = useState("");
  const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilter>("all");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, error } = useArtifacts();
  const { mutate: deleteArtifact } = useDeleteArtifact();

  const artifacts = data?.artifacts || [];

  // Filter by search query and file type
  const filteredArtifacts = useMemo(() => {
    let filtered = [...artifacts];

    // Filter by search query (filename)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((a) => a.filename.toLowerCase().includes(query));
    }

    // Filter by file type
    const mimeTypes = FILE_TYPE_MIME_MAP[fileTypeFilter];
    if (mimeTypes) {
      filtered = filtered.filter((a) => mimeTypes.includes(a.mimeType));
    }

    return filtered;
  }, [artifacts, searchQuery, fileTypeFilter]);

  // Sort by created date (most recent first)
  const sortedArtifacts = useMemo(() => {
    return [...filteredArtifacts].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [filteredArtifacts]);

  // Group by date
  const groupedArtifacts = useMemo(() => groupArtifactsByDate(sortedArtifacts), [sortedArtifacts]);

  // Count stats
  const stats = useMemo(
    () => ({
      total: artifacts.length,
      processed: artifacts.filter((a) => a.extractionStatus === "completed").length,
      pending: artifacts.filter((a) => ["pending", "processing"].includes(a.extractionStatus))
        .length,
      failed: artifacts.filter((a) => a.extractionStatus === "failed").length,
    }),
    [artifacts]
  );

  const handleDeleteArtifact = (id: string) => {
    deleteArtifact(id);
  };

  const handleArtifactClick = (artifact: Artifact) => {
    // For now, just log. Future: could show a preview modal or download
    console.log("Artifact clicked:", artifact);
  };

  if (isLoading) {
    return (
      <div className="min-h-[500px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-2 border-indigo/20 border-t-indigo animate-spin" />
          </div>
          <span className="text-ink-tertiary text-sm font-medium">{labels.loadingArtifacts}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="text-center text-red-400">{labels.errorLoadingArtifacts}</div>
      </div>
    );
  }

  const hasActiveFilters = fileTypeFilter !== "all";

  return (
    <div className="h-full overflow-y-auto app-no-drag">
      {/* ═══════════════════════════════════════════════════════════════════
          HERO SECTION - Upload Artifact CTA
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="px-8 pt-8 pb-6">
        <div className="stagger-1">
          {/* Header */}
          <div className="flex items-end justify-between mb-8">
            <div>
              <h1 className="font-display text-3xl font-semibold text-ink-primary tracking-tight">
                {labels.artifacts}
              </h1>
              <p className="text-ink-tertiary mt-1 text-sm">
                {stats.total} total · {stats.processed} processed · {stats.pending} pending
                {stats.failed > 0 && ` · ${stats.failed} failed`}
              </p>
            </div>

            {/* Search + Filter Toggle */}
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary"
                  size={15}
                />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-sm bg-canvas-muted/50 border-transparent text-ink-primary placeholder:text-ink-tertiary focus:bg-canvas-overlay focus:border-stroke transition-all"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center justify-center w-9 h-9 rounded-lg transition-all ${
                  showFilters || hasActiveFilters
                    ? "bg-indigo/20 text-indigo"
                    : "bg-canvas-muted/50 text-ink-tertiary hover:text-ink-secondary"
                }`}
              >
                <Filter size={16} />
              </button>
            </div>
          </div>

          {/* Filters Row - Collapsible */}
          {showFilters && (
            <div className="flex gap-3 mb-6 animate-reveal-up">
              <Select
                value={fileTypeFilter}
                onValueChange={(v) => setFileTypeFilter(v as FileTypeFilter)}
              >
                <SelectTrigger className="w-[160px] h-9 text-sm bg-canvas-overlay border-stroke-subtle">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="docx">DOCX</SelectItem>
                  <SelectItem value="txt">Text/Markdown</SelectItem>
                  <SelectItem value="image">Images</SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <button
                  onClick={() => setFileTypeFilter("all")}
                  className="px-3 h-9 text-sm text-ink-tertiary hover:text-ink-secondary transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Upload Artifact Button */}
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="group w-full rounded-xl border border-stroke-subtle bg-canvas-overlay p-5 text-left transition-all hover:border-indigo/40 hover:bg-canvas-muted"
          >
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo/10 border border-indigo/20 group-hover:bg-indigo/15 transition-colors">
                <Plus size={20} className="text-indigo" />
              </div>
              <div className="flex-1">
                <h3 className="font-display text-base font-semibold text-ink-primary tracking-tight">
                  {labels.uploadArtifact}
                </h3>
                <p className="text-ink-tertiary text-sm mt-0.5">Drop files or click to browse</p>
              </div>
              <ChevronRight
                size={18}
                className="text-ink-tertiary group-hover:text-indigo group-hover:translate-x-0.5 transition-all"
              />
            </div>
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          ARTIFACT TIMELINE - Chronological list grouped by date
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="px-8 pb-8">
        {groupedArtifacts.length > 0 ? (
          <div className="space-y-6 stagger-2">
            {groupedArtifacts.map((group, groupIndex) => (
              <div key={group.label}>
                {/* Date Group Header */}
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                    {group.label}
                  </h3>
                  <div className="flex-1 h-px bg-stroke-subtle" />
                  <span className="text-xs text-ink-tertiary tabular-nums">
                    {group.artifacts.length}
                  </span>
                </div>

                {/* Artifact Rows */}
                <div className="space-y-2">
                  {group.artifacts.map((artifact, artifactIndex) => (
                    <ArtifactRow
                      key={artifact.id}
                      artifact={artifact}
                      onClick={() => handleArtifactClick(artifact)}
                      onDelete={() => handleDeleteArtifact(artifact.id)}
                      style={{
                        animationDelay: `${groupIndex * 0.05 + artifactIndex * 0.03}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="py-16 text-center stagger-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-canvas-overlay border border-stroke-subtle mb-4">
              <Paperclip size={28} className="text-ink-tertiary" />
            </div>
            <h3 className="font-display text-lg font-medium text-ink-primary mb-1">
              {searchQuery || hasActiveFilters ? "No matches" : labels.noArtifactsYet}
            </h3>
            <p className="text-ink-tertiary text-sm max-w-xs mx-auto">
              {searchQuery || hasActiveFilters
                ? "Try adjusting your search or filters"
                : "Upload documents to use as context for document generation"}
            </p>
          </div>
        )}
      </div>

      {/* Upload Artifact Modal */}
      <UploadArtifactModal open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen} />
    </div>
  );
}
