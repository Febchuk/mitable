import { X } from "lucide-react";
import type { SelectedWindowInfo } from "@mitable/shared";

interface SelectedWindowsListProps {
  windows: SelectedWindowInfo[];
  onRemoveWindow?: (windowId: string) => void;
  showRemoveButton?: boolean;
}

export default function SelectedWindowsList({
  windows,
  onRemoveWindow,
  showRemoveButton = true,
}: SelectedWindowsListProps) {
  if (windows.length === 0) {
    return (
      <div className="text-sm text-text-tertiary italic">
        No windows selected yet
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-x-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
      <div className="flex items-center gap-2">
        {windows.map((window) => (
          <div
            key={window.windowId}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-background-elevated hover:bg-background-elevated/80 rounded-full transition-colors shrink-0 border border-border-subtle"
          >
            <span className="text-xs text-text-primary whitespace-nowrap">
              {window.appName}
            </span>
            {showRemoveButton && onRemoveWindow && (
              <button
                onClick={() => onRemoveWindow(window.windowId)}
                className="p-0.5 rounded-full hover:bg-background-secondary transition-colors"
                aria-label={`Remove ${window.appName} from watch list`}
              >
                <X className="h-3 w-3 text-text-tertiary hover:text-text-primary" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

