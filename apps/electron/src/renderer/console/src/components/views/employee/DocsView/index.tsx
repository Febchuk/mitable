/**
 * DocsView - Main documents list view
 *
 * Main view for knowledge base documentation.
 * Features a hero section and chronological timeline of documents.
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useDocuments } from "@/console/src/hooks/queries/documents";
import {
  Search,
  FileText,
  Sparkles,
  ChevronRight,
  Filter,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DocRow from "./DocRow";
import CreateDocumentModal from "./dialogs/CreateDocumentModal";
import type { DocType, DocStatus, Document } from "@mitable/shared";

// Group documents by date category
function groupDocumentsByDate(documents: Document[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; documents: Document[] }[] = [
    { label: "Today", documents: [] },
    { label: "Yesterday", documents: [] },
    { label: "This Week", documents: [] },
    { label: "Earlier", documents: [] },
  ];

  documents.forEach((doc) => {
    const docDate = new Date(doc.updatedAt);
    const docDay = new Date(
      docDate.getFullYear(),
      docDate.getMonth(),
      docDate.getDate()
    );

    if (docDay.getTime() >= today.getTime()) {
      groups[0].documents.push(doc);
    } else if (docDay.getTime() >= yesterday.getTime()) {
      groups[1].documents.push(doc);
    } else if (docDay.getTime() >= weekAgo.getTime()) {
      groups[2].documents.push(doc);
    } else {
      groups[3].documents.push(doc);
    }
  });

  return groups.filter((g) => g.documents.length > 0);
}

export default function DocsView() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState<DocType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<DocStatus | "all">("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, error } = useDocuments({
    search: searchQuery || undefined,
  });

  const documents = data?.documents || [];

  // Sort by updated date (most recent first)
  const sortedDocuments = useMemo(() => {
    return [...documents].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [documents]);

  // Group by date
  const groupedDocuments = useMemo(
    () => groupDocumentsByDate(sortedDocuments),
    [sortedDocuments]
  );

  // Count stats
  const draftCount = documents.filter((d) => d.status === "draft").length;
  const publishedCount = documents.filter((d) => d.status === "published").length;

  if (isLoading) {
    return (
      <div className="min-h-[500px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-2 border-indigo/20 border-t-indigo animate-spin" />
          </div>
          <span className="text-ink-tertiary text-sm font-medium">
            Loading documents...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="text-center text-red-400">Error loading documents</div>
      </div>
    );
  }

  const hasActiveFilters = docTypeFilter !== "all" || statusFilter !== "all";

  return (
    <div className="min-h-full app-no-drag">
      {/* ═══════════════════════════════════════════════════════════════════
          HERO SECTION - Create/Generate Document CTAs
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="px-8 pt-8 pb-6">
        <div className="stagger-1">
          {/* Header */}
          <div className="flex items-end justify-between mb-8">
            <div>
              <h1 className="font-display text-3xl font-semibold text-ink-primary tracking-tight">
                Docs
              </h1>
              <p className="text-ink-tertiary mt-1 text-sm">
                {documents.length} total · {publishedCount} published · {draftCount} drafts
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
                value={docTypeFilter}
                onValueChange={(v) => setDocTypeFilter(v as DocType | "all")}
              >
                <SelectTrigger className="w-[160px] h-9 text-sm bg-canvas-overlay border-stroke-subtle">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="how-to">How-To Guides</SelectItem>
                  <SelectItem value="knowledge-article">Knowledge Articles</SelectItem>
                  <SelectItem value="troubleshooting">Troubleshooting</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as DocStatus | "all")}
              >
                <SelectTrigger className="w-[140px] h-9 text-sm bg-canvas-overlay border-stroke-subtle">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setDocTypeFilter("all");
                    setStatusFilter("all");
                  }}
                  className="px-3 h-9 text-sm text-ink-tertiary hover:text-ink-secondary transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Create Document Button */}
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="group relative w-full overflow-hidden rounded-2xl border border-stroke-subtle bg-gradient-to-br from-canvas-overlay to-canvas-raised p-6 text-left transition-all duration-300 hover:border-indigo/30 hover:shadow-[0_0_40px_-10px_rgba(99,102,241,0.3)]"
          >
            <div className="absolute -top-16 -right-16 w-48 h-48 bg-indigo/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo/20 to-rose/20 border border-indigo/20 group-hover:scale-105 transition-all duration-300">
                <Sparkles size={22} className="text-indigo" />
              </div>
              <div className="flex-1">
                <h3 className="font-display text-base font-semibold text-ink-primary tracking-tight">
                  Create Document
                </h3>
                <p className="text-ink-tertiary text-sm mt-0.5">
                  Generate with AI or start from scratch
                </p>
              </div>
              <ChevronRight
                size={18}
                className="text-ink-tertiary group-hover:text-indigo group-hover:translate-x-1 transition-all"
              />
            </div>
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DOCUMENT TIMELINE - Chronological list grouped by date
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="px-8 pb-8">
        {groupedDocuments.length > 0 ? (
          <div className="space-y-6 stagger-2">
            {groupedDocuments.map((group, groupIndex) => (
              <div key={group.label}>
                {/* Date Group Header */}
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                    {group.label}
                  </h3>
                  <div className="flex-1 h-px bg-stroke-subtle" />
                  <span className="text-xs text-ink-tertiary tabular-nums">
                    {group.documents.length}
                  </span>
                </div>

                {/* Document Rows */}
                <div className="space-y-2">
                  {group.documents.map((doc, docIndex) => (
                    <DocRow
                      key={doc.id}
                      document={doc}
                      onClick={() => navigate(`/docs/${doc.id}`)}
                      style={{
                        animationDelay: `${groupIndex * 0.05 + docIndex * 0.03}s`,
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
              <FileText size={28} className="text-ink-tertiary" />
            </div>
            <h3 className="font-display text-lg font-medium text-ink-primary mb-1">
              {searchQuery || hasActiveFilters ? "No matches" : "No documents yet"}
            </h3>
            <p className="text-ink-tertiary text-sm max-w-xs mx-auto">
              {searchQuery || hasActiveFilters
                ? "Try adjusting your search or filters"
                : "Generate docs from sessions or create one manually"}
            </p>
          </div>
        )}
      </div>

      {/* Create Document Modal */}
      <CreateDocumentModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
      />
    </div>
  );
}
