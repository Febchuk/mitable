import { Button } from "@/components/ui/button";
import { ExternalLink, X } from "lucide-react";

interface HeaderProps {
  onOpenInConsole: () => void;
  onClose: () => void;
  hasConversation: boolean;
}

function Header({ onOpenInConsole, onClose, hasConversation }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 app-drag">
      {/* Left: Branding */}
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-white">Mitable</span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 app-no-drag">
        {hasConversation && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenInConsole}
            className="flex items-center gap-1.5 text-white/70 hover:text-white hover:bg-white/10"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="text-sm">Console</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white/70 hover:text-white hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}

export default Header;
