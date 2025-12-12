import { useState, useRef, useEffect } from "react";
import { ArrowUp, Wand2, User } from "lucide-react";
import logoIconSvg from "../../../../../../assets/logo-icon.svg";
import { Button } from "@/components/ui/button";
import { findAIResponse, DEMO_CONFIG } from "@/console/src/data/demoDraft";
import RecipientSelector from "./RecipientSelector";
import { getRecipientById } from "@/console/src/data/demoRecipients";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestedEdit?: string;
  isTyping?: boolean;
}

interface AIChatPanelProps {
  onApplySuggestion: (edit: string) => void;
  recipients: string[];
  onRecipientsChange: (ids: string[]) => void;
}

export default function AIChatPanel({
  onApplySuggestion,
  recipients,
  onRecipientsChange,
}: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: DEMO_CONFIG.ai.welcomeMessage,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get recipient names for display
  const recipientNames = recipients
    .map((id) => getRecipientById(id)?.name)
    .filter(Boolean);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (query?: string) => {
    const userQuery = query || input.trim();
    if (!userQuery || isLoading) return;

    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userQuery,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Add typing indicator
    const typingId = `typing-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: typingId,
        role: "assistant",
        content: "",
        isTyping: true,
      },
    ]);

    // Simulate AI response (hard-coded demo)
    setTimeout(() => {
      // Find matching response or use generic
      const aiResponse = findAIResponse(userQuery);

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: aiResponse
          ? aiResponse.aiResponse
          : DEMO_CONFIG.ai.fallbackResponse,
        suggestedEdit: aiResponse?.suggestedEdit,
      };

      // Remove typing indicator and add real message
      setMessages((prev) =>
        prev.filter((m) => m.id !== typingId).concat(assistantMessage)
      );
      setIsLoading(false);
    }, 1000);
  };

  const handleApply = (suggestedEdit: string) => {
    onApplySuggestion(suggestedEdit);
    // Add confirmation message
    setMessages((prev) => [
      ...prev,
      {
        id: `applied-${Date.now()}`,
        role: "assistant",
        content: DEMO_CONFIG.ai.appliedMessage,
      },
    ]);
  };

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Recipient Card */}
      <div className="bg-black/20 rounded-2xl border border-white/10 px-4 py-3 flex-shrink-0">
        <p className="text-xs text-text-tertiary mb-2">Send to</p>
        <RecipientSelector values={recipients} onChange={onRecipientsChange} />
      </div>

      {/* Chat Card */}
      <div className="flex-1 flex flex-col bg-black/20 rounded-2xl border border-white/10 min-h-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className="animate-in fade-in slide-in-from-bottom-2 duration-200"
            >
              {/* Message bubble */}
              <div
                className={`flex gap-2 ${
                  message.role === "user" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    message.role === "user"
                      ? "bg-primary/20"
                      : "bg-background-elevated"
                  }`}
                >
                  {message.role === "user" ? (
                    <User size={12} className="text-primary" />
                  ) : (
                    <img src={logoIconSvg} alt="Mitable" className="w-3 h-3" />
                  )}
                </div>

                {/* Content */}
                <div
                  className={`max-w-[85%] ${
                    message.role === "user" ? "text-right" : "text-left"
                  }`}
                >
                  <div
                    className={`inline-block rounded-lg px-3 py-2 text-sm ${
                      message.role === "user"
                        ? "bg-primary/20 text-text-primary"
                        : "bg-background-elevated text-text-primary"
                    }`}
                  >
                    {message.isTyping ? (
                      <div className="flex gap-1 py-1">
                        <span
                          className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        />
                        <span
                          className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        />
                        <span
                          className="w-2 h-2 bg-text-tertiary rounded-full animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        />
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>

                  {/* Apply suggestion button */}
                  {message.suggestedEdit && !message.isTyping && (
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApply(message.suggestedEdit!)}
                        className="gap-2 text-xs h-7 border-primary/30 hover:bg-primary/10 hover:text-primary"
                      >
                        <Wand2 size={12} />
                        Apply suggestion
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 flex-shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={DEMO_CONFIG.ui.aiChat.inputPlaceholder}
              disabled={isLoading}
              className="flex-1 bg-background-elevated border border-border-subtle rounded-full px-4 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all disabled:opacity-50"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isLoading}
              className="bg-primary hover:bg-primary-hover h-9 w-9 rounded-full disabled:opacity-50"
            >
              <ArrowUp size={16} />
            </Button>
          </form>
          {recipientNames.length > 0 && (
            <p className="text-xs text-text-tertiary mt-2 text-center">
              {DEMO_CONFIG.ui.aiChat.sendingToLabel}{" "}
              <span className="text-primary">
                {recipientNames.length === 1
                  ? recipientNames[0]
                  : `${recipientNames.length} recipients`}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
