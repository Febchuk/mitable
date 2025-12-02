import { X } from "lucide-react";

interface WindowChipProps {
  appName: string;
  windowId: string;
  onRemove: (windowId: string) => void;
}

function WindowChip({ appName, windowId, onRemove }: WindowChipProps) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 rounded-full transition-colors shrink-0">
      <span className="text-sm text-white/90 whitespace-nowrap">{appName}</span>
      <button
        onClick={() => onRemove(windowId)}
        className="p-0.5 rounded-full hover:bg-white/20 transition-colors"
        aria-label={`Remove ${appName} from watch list`}
      >
        <X className="h-3.5 w-3.5 text-white/70 hover:text-white" />
      </button>
    </div>
  );
}

export default WindowChip;
