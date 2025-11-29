import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Copy, Pencil, Check } from "lucide-react";
import { Response } from "@/components/ui/ai-response";
import type { Message } from "../App";

interface MessageBubbleProps {
  message: Message;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // AI Message - plain formatted text, no bubble, no hover actions
  if (!isUser) {
    return (
      <div className="mb-4 max-w-[85%]">
        <div className="text-[15px] leading-[1.6] text-white">
          <Response parseIncompleteMarkdown={message.isStreaming}>
            {message.content}
          </Response>
        </div>
      </div>
    );
  }

  // User Message - left-aligned dark bubble with hover actions
  return (
    <div
      className="flex justify-start"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="relative group max-w-[85%]">
        {/* User message bubble - dark rounded box */}
        <div className="bg-[#2A2A2A] text-white rounded-2xl px-4 py-3">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>

        {/* Hover actions - only for user messages */}
        {showActions && (
          <div className="absolute right-0 -top-8 flex items-center gap-1 bg-black/60 border border-white/20 rounded-lg p-1 shadow-sm">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-white/70 hover:text-white hover:bg-white/10"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopy}
                    className="h-6 w-6 text-white/70 hover:text-white hover:bg-white/10"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copied ? "Copied!" : "Copy"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
