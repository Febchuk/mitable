import { Code, LucideIcon, Users, Workflow } from "lucide-react";
import UserMessage from "../../../components/domain/messages/UserMessage";
import AIMessage from "../../../components/domain/messages/AIMessage";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "card";
  messageType?: string;
  cardData?: any;
  sources?: any[];
  windowTrigger?: {
    window: "nudge" | "guide";
    data: any;
  };
}

interface ConversationDialogProps {
  messages: Message[];
  onSubmit: (message: string) => void;
  onClose: () => void;
  onCardClick: (message: Message) => void;
}

export default function ConversationDialog({
  messages,
  onSubmit: _onSubmit,
  onClose,
  onCardClick,
}: ConversationDialogProps) {
  return (
    <div className="relative w-full h-[600px] flex flex-col bg-background-secondary rounded-2xl overflow-hidden app-no-drag">
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-status-success hover:bg-status-success/90 flex items-center justify-center transition-colors"
        aria-label="Close"
      >
        <Code size={16} className="text-white" />
      </button>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 pt-16">
        {messages.map((message) => {
          if (message.type === "card" && message.cardData) {
            // Determine card title/subtitle/icon based on messageType
            let title = "";
            let subtitle = "";
            let Icon: LucideIcon = Code;

            if (message.messageType === "experts") {
              const expertCount = message.cardData.experts?.length || 0;
              title = `${expertCount} Expert${expertCount > 1 ? 's' : ''} Available`;
              subtitle = "View Experts";
              Icon = Users;
            } else if (message.messageType === "workflow") {
              title = message.cardData.guide?.title || "Interactive Workflow";
              subtitle = "Start Guide";
              Icon = Workflow;
            } else {
              // Fallback for unknown card types
              title = message.cardData.title || "Card";
              subtitle = message.cardData.subtitle || "Click to view";
            }

            return (
              <Card
                key={message.id}
                className="w-full mb-4 p-4 flex items-center justify-between cursor-pointer hover:bg-accent transition-colors app-no-drag"
                onClick={() => onCardClick(message)}
              >
                <div className="text-left">
                  <CardTitle className="text-base mb-1">{title}</CardTitle>
                  <CardDescription>{subtitle}</CardDescription>
                </div>
                <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center flex-shrink-0 ml-4">
                  <Icon size={24} className="text-primary-foreground" />
                </div>
              </Card>
            );
          }

          return message.role === "user" ? (
            <UserMessage key={message.id} content={message.content} />
          ) : (
            <AIMessage key={message.id} content={message.content} />
          );
        })}
      </div>
    </div>
  );
}
