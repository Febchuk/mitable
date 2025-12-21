/**
 * DocCard
 *
 * Card component for displaying a document in the list view.
 */

import { FileText, BookOpen, AlertCircle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Document, DocType, DocStatus } from "@mitable/shared";

interface DocCardProps {
  document: Document;
  onClick: () => void;
}

const DOC_TYPE_LABELS_LOCAL: Record<DocType, string> = {
  "how-to": "How-To Guide",
  "knowledge-article": "Knowledge Article",
  troubleshooting: "Troubleshooting",
};

const DOC_STATUS_COLORS: Record<DocStatus, string> = {
  draft: "bg-yellow-500/20 text-yellow-400 border-transparent",
  published: "bg-green-500/20 text-green-400 border-transparent",
  archived: "bg-gray-500/20 text-gray-400 border-transparent",
};

export default function DocCard({ document, onClick }: DocCardProps) {
  const Icon = getDocTypeIcon(document.docType as DocType);
  const statusColor = DOC_STATUS_COLORS[document.status as DocStatus] || DOC_STATUS_COLORS.draft;

  // Format date
  const formattedDate = new Date(document.updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Truncate description
  const truncatedDescription = document.description
    ? document.description.length > 100
      ? document.description.slice(0, 100) + "..."
      : document.description
    : null;

  return (
    <div
      onClick={onClick}
      className="bg-background-elevated rounded-lg border border-border-subtle p-5 cursor-pointer hover:border-primary/50 transition-colors group"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon size={20} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-text-primary truncate group-hover:text-primary transition-colors">
              {document.title}
            </h3>
            <p className="text-sm text-text-secondary">
              {DOC_TYPE_LABELS_LOCAL[document.docType as DocType]}
            </p>
          </div>
        </div>
        <Badge className={statusColor}>{document.status}</Badge>
      </div>

      {/* Description */}
      {truncatedDescription && (
        <p className="text-text-secondary text-sm mb-4 line-clamp-2">{truncatedDescription}</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-secondary">Updated {formattedDate}</span>
        <div className="flex items-center gap-2">
          {document.notionPageId && (
            <Badge variant="outline" className="text-xs gap-1">
              <ExternalLink size={12} />
              Notion
            </Badge>
          )}
          {document.creator && (
            <span className="text-text-secondary">
              by {document.creator.firstName} {document.creator.lastName}
            </span>
          )}
        </div>
      </div>

      {/* Tags */}
      {document.tags && (document.tags as string[]).length > 0 && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {(document.tags as string[]).slice(0, 3).map((tag, i) => (
            <Badge key={i} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
          {(document.tags as string[]).length > 3 && (
            <Badge variant="secondary" className="text-xs">
              +{(document.tags as string[]).length - 3}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Get icon for document type
 */
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
