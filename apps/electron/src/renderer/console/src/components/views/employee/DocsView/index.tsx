/**
 * DocsView
 *
 * Main view for knowledge base documentation.
 * Lists documents with filtering by type and status.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDocuments } from "@/console/src/hooks/queries/documents";
import { Search, Plus, FileText, BookOpen, AlertCircle, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DocCard from "./DocCard";
import GenerateDocDialog from "./dialogs/GenerateDocDialog";
import type { DocType, DocStatus } from "@mitable/shared";

export default function DocsView() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState<DocType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<DocStatus | "all">("all");
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);

  const { data, isLoading, error } = useDocuments({
    docType: docTypeFilter === "all" ? undefined : docTypeFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
    search: searchQuery || undefined,
  });

  const documents = data?.documents || [];

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-center text-text-secondary">Loading documents...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="text-center text-status-error">Error loading documents</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 app-no-drag">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-text-primary">Knowledge Base</h1>
          <p className="text-text-secondary mt-2">
            Documentation generated from your work sessions
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsGenerateDialogOpen(true)}
            className="gap-2"
          >
            <Sparkles size={18} />
            Generate from Session
          </Button>
          <Button
            onClick={() => navigate("/docs/new")}
            className="gap-2 bg-primary text-white hover:bg-primary/90"
          >
            <Plus size={20} />
            New Document
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
            size={20}
          />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 bg-background-elevated border-transparent text-text-primary placeholder:text-text-secondary"
          />
        </div>

        {/* Type Filter */}
        <Select
          value={docTypeFilter}
          onValueChange={(v) => setDocTypeFilter(v as DocType | "all")}
        >
          <SelectTrigger className="w-[180px] bg-background-elevated border-transparent">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="how-to">How-To Guides</SelectItem>
            <SelectItem value="knowledge-article">Knowledge Articles</SelectItem>
            <SelectItem value="troubleshooting">Troubleshooting</SelectItem>
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as DocStatus | "all")}
        >
          <SelectTrigger className="w-[150px] bg-background-elevated border-transparent">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Documents Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {documents.map((doc) => (
          <DocCard
            key={doc.id}
            document={doc}
            onClick={() => navigate(`/docs/${doc.id}`)}
          />
        ))}
      </div>

      {/* Empty State */}
      {documents.length === 0 && (
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <FileText size={32} className="text-primary" />
          </div>
          <h3 className="text-xl font-semibold text-text-primary mb-2">
            No documents yet
          </h3>
          <p className="text-text-secondary mb-6 max-w-md mx-auto">
            {searchQuery || docTypeFilter !== "all" || statusFilter !== "all"
              ? "No documents match your filters"
              : "Generate documentation from your work sessions or create a new document manually."}
          </p>
          {!searchQuery && docTypeFilter === "all" && statusFilter === "all" && (
            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => setIsGenerateDialogOpen(true)}
                className="gap-2"
              >
                <Sparkles size={18} />
                Generate from Session
              </Button>
              <Button
                onClick={() => navigate("/docs/new")}
                className="gap-2 bg-primary text-white hover:bg-primary/90"
              >
                <Plus size={20} />
                Create Document
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Generate Dialog */}
      <GenerateDocDialog
        open={isGenerateDialogOpen}
        onOpenChange={setIsGenerateDialogOpen}
      />
    </div>
  );
}

/**
 * Get icon for document type
 */
export function getDocTypeIcon(docType: DocType) {
  switch (docType) {
    case "how-to":
      return BookOpen;
    case "knowledge-article":
      return FileText;
    case "troubleshooting":
      return AlertCircle;
    default:
      return FileText;
  }
}
