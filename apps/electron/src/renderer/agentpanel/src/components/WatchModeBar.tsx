import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import WindowChip from "./WindowChip";
import type { SelectedWindowInfo } from "../global";

interface WatchModeBarProps {
  isExpanded: boolean;
  windows: SelectedWindowInfo[];
  onEyeClick: () => void;
  onRemoveWindow: (windowId: string) => void;
}

function WatchModeBar({
  isExpanded,
  windows,
  onEyeClick,
  onRemoveWindow,
}: WatchModeBarProps) {
  const hasWindows = windows.length > 0;
  const isWatching = hasWindows; // Watch mode = has windows

  return (
    <div className="flex items-center gap-2">
      {/* Eye button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onEyeClick}
        className="relative h-9 w-9 shrink-0 text-white/70 hover:text-white hover:bg-white/10"
        aria-label={
          isExpanded
            ? "Collapse watch list"
            : isWatching
              ? "Expand watch list"
              : "Start watching"
        }
      >
        {hasWindows || isExpanded ? (
          <Eye className="h-5 w-5" />
        ) : (
          <EyeOff className="h-5 w-5" />
        )}

        {/* Count badge - only show when collapsed with windows */}
        {!isExpanded && hasWindows && (
          <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
            {windows.length}
          </span>
        )}
      </Button>

      {/* Horizontal scroll of chips - only show when expanded */}
      {isExpanded && (
        <div className="flex-1 overflow-x-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
          <div className="flex items-center gap-2 py-1">
            {windows.map((window) => (
              <WindowChip
                key={window.windowId}
                appName={window.appName}
                windowId={window.windowId}
                onRemove={onRemoveWindow}
              />
            ))}
            {windows.length === 0 && (
              <span className="text-sm text-white/50 italic">
                Click windows to add them to watch list
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default WatchModeBar;
