import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MessageSquare, ExternalLink, X } from "lucide-react";
import LogoIcon from "@/assets/logo-icon.svg";

interface HeaderProps {
  onNewChat: () => void;
  onOpenChats: () => void;
  onOpenInConsole: () => void;
  onClose: () => void;
  hasConversation: boolean;
  showChatsTitle?: boolean;
}

function Header({
  onNewChat,
  onOpenChats,
  onOpenInConsole,
  onClose,
  hasConversation,
  showChatsTitle = false,
}: HeaderProps) {
  return (
    <header className="relative flex items-center justify-between px-4 py-3 app-drag">
      {/* Left: Logo with dropdown */}
      <div className="flex items-center gap-3 app-no-drag z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="focus:outline-none">
              <img
                src={LogoIcon}
                alt="Mitable"
                className="h-6 w-auto cursor-pointer hover:opacity-80 transition-opacity"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="bg-black/80 backdrop-blur-sm border-white/20 text-white min-w-[160px]"
          >
            <DropdownMenuItem
              onClick={onNewChat}
              className="text-white/90 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Chat
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onOpenChats}
              className="text-white/90 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Chats
            </DropdownMenuItem>
            {hasConversation && (
              <DropdownMenuItem
                onClick={onOpenInConsole}
                className="text-white/90 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in Console
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Center: Title (when showing chats) */}
      {showChatsTitle && (
        <span className="absolute left-1/2 -translate-x-1/2 text-white font-medium">Chats</span>
      )}

      {/* Right: Close button */}
      <div className="flex items-center gap-2 app-no-drag z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="rounded-full h-8 w-8 text-white/70 hover:text-white hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}

export default Header;
