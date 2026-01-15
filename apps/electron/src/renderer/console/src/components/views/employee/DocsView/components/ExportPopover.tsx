/**
 * ExportPopover
 *
 * Smart popover menu for multi-destination document exports.
 * Shows status of all export destinations and allows re-exports.
 */

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ChevronDown, ExternalLink, CheckCircle, Circle, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ExportDestination {
  id: "notion" | "google-docs";
  name: string;
  isExported: boolean;
  lastSyncedAt?: Date | null;
  documentUrl?: string | null;
  onExport: () => void;
  onReExport: () => void;
}

interface ExportPopoverProps {
  destinations: ExportDestination[];
  onExportAll?: () => void;
  isExporting?: boolean;
}

export default function ExportPopover({
  destinations,
  onExportAll,
  isExporting,
}: ExportPopoverProps) {
  const [open, setOpen] = useState(false);

  const exportedCount = destinations.filter((d) => d.isExported).length;
  const hasAnyExport = exportedCount > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="bg-background-elevated border-border-subtle text-text-primary hover:bg-background-hover gap-2 relative"
          disabled={isExporting}
        >
          <ExternalLink size={16} />
          Export
          <ChevronDown size={14} />
          {hasAnyExport && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background-primary" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="bg-background-elevated border-border-subtle w-80 p-0" align="end">
        <div className="p-3 border-b border-border-subtle">
          <div className="text-sm font-medium text-text-primary">Export to...</div>
        </div>

        <div className="py-2">
          {destinations.map((dest) => (
            <div
              key={dest.id}
              className="px-3 py-3 hover:bg-background-hover transition-colors border-b border-border-subtle last:border-0"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  {dest.isExported ? (
                    <CheckCircle size={18} className="text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle size={18} className="text-text-tertiary flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary">{dest.name}</div>
                    {dest.isExported ? (
                      <div className="text-xs text-text-tertiary mt-0.5">
                        Synced{" "}
                        {dest.lastSyncedAt
                          ? formatDistanceToNow(new Date(dest.lastSyncedAt), {
                              addSuffix: true,
                            })
                          : "recently"}
                      </div>
                    ) : (
                      <div className="text-xs text-text-tertiary mt-0.5">Not exported</div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {dest.isExported ? (
                    <>
                      {dest.documentUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-text-secondary hover:text-text-primary"
                          onClick={() => {
                            window.open(dest.documentUrl!, "_blank");
                            setOpen(false);
                          }}
                        >
                          View
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-primary hover:text-primary/80 gap-1"
                        onClick={() => {
                          dest.onReExport();
                          setOpen(false);
                        }}
                        disabled={isExporting}
                      >
                        <RefreshCw size={12} />
                        Re-export
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-text-secondary hover:text-text-primary"
                      onClick={() => {
                        dest.onExport();
                        setOpen(false);
                      }}
                      disabled={isExporting}
                    >
                      Export
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Re-export all button (only show if multiple destinations are exported) */}
        {exportedCount > 1 && onExportAll && (
          <div className="p-3 border-t border-border-subtle">
            <Button
              variant="outline"
              size="sm"
              className="w-full bg-primary/10 border-primary/20 text-primary hover:bg-primary/20 gap-2"
              onClick={() => {
                onExportAll();
                setOpen(false);
              }}
              disabled={isExporting}
            >
              <RefreshCw size={14} />
              Re-export to all
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
