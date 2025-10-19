import { Code, LucideIcon } from "lucide-react";
import UserMessage from "../../../components/domain/messages/UserMessage";
import AIMessage from "../../../components/domain/messages/AIMessage";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "card";
  cardData?: {
    title: string;
    subtitle: string;
    icon: LucideIcon;
  };
}

interface ConversationDialogProps {
  messages: Message[];
  onSubmit: (message: string) => void;
  onClose: () => void;
  onCardClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export default function ConversationDialog({
  messages,
  onSubmit: _onSubmit,
  onClose,
  onCardClick,
  onMouseEnter,
  onMouseLeave,
}: ConversationDialogProps) {
  return (
    <div
      className="relative w-full h-[600px] flex flex-col bg-background-secondary rounded-2xl overflow-hidden app-no-drag"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
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
            const Icon = message.cardData.icon;
            return (
              <Card
                key={message.id}
                className="w-full mb-4 p-4 flex items-center justify-between cursor-pointer hover:bg-accent transition-colors app-no-drag"
                onClick={onCardClick}
              >
                <div className="text-left">
                  <CardTitle className="text-base mb-1">{message.cardData.title}</CardTitle>
                  <CardDescription>{message.cardData.subtitle}</CardDescription>
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
