import { Button } from "@/components/ui/button";
import { ExternalLink, X } from "lucide-react";

interface HeaderProps {
  onOpenInConsole: () => void;
  onClose: () => void;
  hasConversation: boolean;
}

function Header({ onOpenInConsole, onClose, hasConversation }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border app-drag">
      {/* Left: Branding */}
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-foreground">Mitable</span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 app-no-drag">
        {hasConversation && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenInConsole}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="text-sm">Console</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}

export default Header;
