/**
 * DocsView - Main documents list view
 *
 * Follows console pattern: clean list with search, organized by time.
 * Create flow uses slide-over panel for AI conversation.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDocuments } from "@/console/src/hooks/queries/documents";
import {
  Search,
  Plus,
  FileText,
  BookOpen,
  AlertCircle,
  Clock,
  MoreHorizontal,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import DocumentCreator from "./DocumentCreator";
import type { DocType, DocStatus } from "@mitable/shared";

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString();
}

function getDocTypeIcon(docType: DocType) {
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

function getDocTypeColor(docType: DocType) {
  switch (docType) {
    case "how-to":
      return "text-blue-400";
    case "knowledge-article":
      return "text-purple-400";
    case "troubleshooting":
      return "text-orange-400";
    default:
      return "text-gray-400";
  }
}

function getStatusBadge(status: DocStatus) {
  const styles = {
    draft: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    published: "bg-green-500/10 text-green-400 border-green-500/20",
    archived: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  };
  return styles[status] || styles.draft;
}

export default function DocsView() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);

  const { data, isLoading, error } = useDocuments({
    search: searchQuery || undefined,
  });

  const documents = data?.documents || [];

  // Group documents by time
  const now = new Date();
  const today = documents.filter((doc: any) => {
    const docDate = new Date(doc.createdAt);
    return docDate.toDateString() === now.toDateString();
  });

  const thisWeek = documents.filter((doc: any) => {
    const docDate = new Date(doc.createdAt);
    const diffDays = Math.floor((now.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 7;
  });

  const older = documents.filter((doc: any) => {
    const docDate = new Date(doc.createdAt);
    const diffDays = Math.floor((now.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > 7;
  });

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

  const renderDocSection = (title: string, docs: any[]) => {
    if (docs.length === 0) return null;
    return (
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider px-2">
          {title}
        </h3>
        {docs.map((doc) => {
          const Icon = getDocTypeIcon(doc.docType);
          return (
            <div
              key={doc.id}
              onClick={() => navigate(`/docs/${doc.id}`)}
              className="group bg-background-secondary border border-border-subtle rounded-lg p-4 hover:border-purple-500/30 hover:shadow-card-hover transition-all duration-200 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-background-elevated rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon size={18} className={getDocTypeColor(doc.docType)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-text-primary font-medium truncate group-hover:text-white transition-colors">
                        {doc.title}
                      </h4>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${getStatusBadge(doc.status)}`}
                      >
                        {doc.status}
                      </span>
                    </div>
                    <p className="text-text-tertiary text-sm line-clamp-2">
                      {doc.summary || "No summary available"}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-text-quaternary">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {formatRelativeTime(doc.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreHorizontal size={16} className="text-text-tertiary" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => navigate(`/docs/${doc.id}`)}>
                      View
                    </DropdownMenuItem>
                    <DropdownMenuItem>Edit</DropdownMenuItem>
                    <DropdownMenuItem className="text-status-error">Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-8 space-y-6 app-no-drag">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Documents</h1>
          <p className="text-text-secondary mt-2">
            Create and manage documentation from your work sessions
          </p>
        </div>
        <Button
          onClick={() => setIsCreatorOpen(true)}
          className="gap-2 bg-gradient-purple text-white hover:shadow-glow-purple transition-all duration-300"
        >
          <Plus size={20} />
          <span>Create Document</span>
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
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

      {/* Document List */}
      <div className="space-y-6">
        {renderDocSection("Today", today)}
        {renderDocSection("This Week", thisWeek)}
        {renderDocSection("Older", older)}
      </div>

      {/* Empty State */}
      {documents.length === 0 && (
        <div className="bg-background-secondary/50 backdrop-blur rounded-xl border border-border-subtle p-12 text-center shadow-card">
          <div className="w-16 h-16 bg-gradient-purple-blue rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText size={32} className="text-white" />
          </div>
          <p className="text-text-secondary text-lg">
            {searchQuery ? `No documents found matching "${searchQuery}"` : "No documents yet"}
          </p>
          <p className="text-text-tertiary text-sm mt-2">
            {searchQuery
              ? "Try a different search term"
              : "Create your first document with AI assistance"}
          </p>
          {!searchQuery && (
            <Button
              onClick={() => setIsCreatorOpen(true)}
              className="gap-2 mt-6 bg-gradient-purple text-white hover:shadow-glow-purple"
            >
              <Sparkles size={18} />
              <span>Create Document</span>
            </Button>
          )}
        </div>
      )}

      {/* Document Creator Modal */}
      <Dialog open={isCreatorOpen} onOpenChange={setIsCreatorOpen}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-black/40 backdrop-blur-md"
          className="w-[420px] max-w-[92vw] h-[78vh] max-h-[760px] p-0 bg-background-primary border-border-subtle shadow-2xl rounded-2xl overflow-hidden"
        >
          <DialogTitle className="sr-only">Create Document</DialogTitle>
          <DialogDescription className="sr-only">
            Start a new document with AI assistance from your session data.
          </DialogDescription>
          <DocumentCreator onClose={() => setIsCreatorOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
