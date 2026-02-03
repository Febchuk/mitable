/**
 * DocRow
 *
 * Horizontal document item for the timeline list.
 * Minimal design with status stripe accent.
 */

import { CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import type { Document, DocType, DocStatus } from "@mitable/shared";

interface DocRowProps {
  document: Document;
  onClick: () => void;
  style?: CSSProperties;
}

const DOC_TYPE_LABELS: Record<DocType, string> = {
  "how-to": "How-To",
  "knowledge-article": "Article",
  troubleshooting: "Troubleshoot",
};

const STATUS_CONFIG: Record<DocStatus, { bgClass: string; textClass: string }> = {
  draft: {
    bgClass: "bg-amber-500",
    textClass: "text-amber-500",
  },
  published: {
    bgClass: "bg-emerald",
    textClass: "text-emerald",
  },
  archived: {
    bgClass: "bg-ink-tertiary",
    textClass: "text-ink-tertiary",
  },
};

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function DocRow({ document, onClick, style }: DocRowProps) {
  const docType = document.docType as DocType;
  const status = document.status as DocStatus;

  const typeLabel = DOC_TYPE_LABELS[docType] || "Article";
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.draft;

  return (
    <div
      onClick={onClick}
      style={style}
      className="group relative flex items-center gap-4 px-4 py-3.5 rounded-xl bg-canvas-overlay/50 border border-transparent cursor-pointer transition-all duration-200 hover:bg-canvas-overlay hover:border-stroke-subtle animate-reveal-up"
    >
      {/* Status Stripe */}
      <div
        className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-full ${statusConfig.bgClass}`}
      />

      {/* Time */}
      <span className="w-20 flex-shrink-0 pl-2 text-sm tabular-nums text-ink-secondary">
        {formatTime(document.updatedAt)}
      </span>

      {/* Document Title */}
      <h4 className="flex-1 min-w-0 text-[15px] font-medium text-ink-primary truncate group-hover:text-white transition-colors">
        {document.title || "Untitled Document"}
      </h4>

      {/* Type */}
      <span className="text-sm text-ink-tertiary w-24">{typeLabel}</span>

      {/* Notion indicator - text only */}
      {document.notionPageId && <span className="text-xs text-ink-tertiary">Notion</span>}

      {/* Status */}
      <span
        className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.textClass} bg-current/10 capitalize`}
      >
        {status}
      </span>

      {/* Arrow */}
      <ChevronRight
        size={16}
        className="text-ink-tertiary opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
      />
    </div>
  );
}
