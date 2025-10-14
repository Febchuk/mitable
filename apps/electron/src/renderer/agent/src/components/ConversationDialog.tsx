import { Code, LucideIcon } from "lucide-react";
import UserMessage from "../../../components/messages/UserMessage";
import AIMessage from "../../../components/messages/AIMessage";
import InteractiveCard from "../../../components/ui/InteractiveCard";

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
            return (
              <InteractiveCard
                key={message.id}
                title={message.cardData.title}
                subtitle={message.cardData.subtitle}
                icon={message.cardData.icon}
                onClick={onCardClick}
              />
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
