/**
 * AIChatPanel
 *
 * Right side panel for AI-assisted editing.
 * Users can ask for revisions and apply suggestions.
 */

import { useState, useRef, useEffect } from "react";
import { ArrowUp, Wand2, Check } from "lucide-react";
import logoIconSvg from "../../../../../assets/logo-icon.svg";
import { Button } from "@/components/ui/button";
import {
  chatRefineSummary,
  loadRefinementChat,
  saveRefinementChat,
} from "@/console/src/services/monitoringService";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestedEdit?: string;
  isTyping?: boolean;
  applied?: boolean;
}

interface AIChatPanelProps {
  currentContent: string;
  onApplySuggestion: (edit: string) => void;
  onRevise: (instruction: string, currentContent: string) => Promise<{ suggestion: string }>;
  contextLabel?: string; // e.g., "session summary"
  sessionId?: string; // When provided, uses conversational /summary/chat endpoint
}

const WELCOME_MESSAGE =
  "I can help you refine your summary. Try asking me to:\n\n• Make it more concise\n• Add more detail\n• Make it more professional\n• Focus on accomplishments";

export default function AIChatPanel({
  currentContent,
  onApplySuggestion,
  onRevise,
  contextLabel = "content",
  sessionId,
}: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: WELCOME_MESSAGE,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Track conversation history for the conversational endpoint
  const chatHistoryRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);

  // Load persisted chat history on mount
  useEffect(() => {
    if (!sessionId) return;
    loadRefinementChat(sessionId)
      .then(({ messages: saved }) => {
        if (!saved || saved.length === 0) return;

        // Parse saved messages back into display format
        const restored: Message[] = saved.map((m, i) => {
          // Check if assistant message contains a <summary> tag (has suggestedEdit)
          const summaryMatch =
            m.role === "assistant" ? m.content.match(/<summary>([\s\S]*?)<\/summary>/) : null;
          const displayContent = summaryMatch
            ? m.content.replace(/<summary>[\s\S]*?<\/summary>/, "").trim() ||
              "Here's the revised summary:"
            : m.content;

          return {
            id: `restored-${i}`,
            role: m.role,
            content: displayContent,
            suggestedEdit: summaryMatch?.[1]?.trim(),
          };
        });

        // Rebuild chat history ref for the conversational endpoint
        chatHistoryRef.current = saved.map((m) => ({
          role: m.role,
          content:
            m.role === "user"
              ? m.content
              : m.content.replace(/<summary>[\s\S]*?<\/summary>/, "").trim(),
        }));

        setMessages([{ id: "welcome", role: "assistant", content: WELCOME_MESSAGE }, ...restored]);
      })
      .catch(() => {}); // Silently fail — fresh chat is fine
  }, [sessionId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const userQuery = input.trim();
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

    // Reset textarea height back to single line
    const textarea = document.querySelector<HTMLTextAreaElement>(
      "textarea[placeholder='Ask AI to help edit...']"
    );
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.overflowY = "hidden";
    }

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

    try {
      let assistantMessage: Message;

      if (sessionId) {
        // Conversational endpoint — send full chat history
        chatHistoryRef.current.push({ role: "user", content: userQuery });

        const result = await chatRefineSummary(sessionId, chatHistoryRef.current, currentContent);

        chatHistoryRef.current.push({ role: "assistant", content: result.message });

        assistantMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: result.message,
          suggestedEdit: result.suggestedEdit ?? undefined,
        };
      } else {
        // Legacy single-shot revision
        const result = await onRevise(userQuery, currentContent);

        assistantMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: "Here's a revised version based on your request:",
          suggestedEdit: result.suggestion,
        };
      }

      // Remove typing indicator and add real message
      setMessages((prev) => prev.filter((m) => m.id !== typingId).concat(assistantMessage));
    } catch (error) {
      // Handle error
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "Sorry, I couldn't process that request. Please try again.",
      };
      setMessages((prev) => prev.filter((m) => m.id !== typingId).concat(errorMessage));
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = (messageId: string, suggestedEdit: string) => {
    onApplySuggestion(suggestedEdit);
    // Mark the message as applied (removes button, shows checkmark)
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, suggestedEdit: undefined, applied: true } : m))
    );

    // Persist: strip <summary> from the applied message so it doesn't reappear on reload
    if (sessionId) {
      chatHistoryRef.current = chatHistoryRef.current.map((m) => {
        if (m.role === "assistant" && m.content.includes(`<summary>${suggestedEdit}</summary>`)) {
          return { ...m, content: m.content.replace(/<summary>[\s\S]*?<\/summary>/, "").trim() };
        }
        return m;
      });
      saveRefinementChat(sessionId, chatHistoryRef.current).catch(() => {});
    }
  };

  return (
    <div className="h-full flex flex-col bg-black/20 rounded-2xl border border-white/10">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-medium text-text-primary">AI Assistant</h3>
        <p className="text-xs text-text-tertiary">Ask me to help edit your {contextLabel}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* Message bubble */}
            <div
              className={`flex gap-2 ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              {/* Avatar — only for assistant */}
              {message.role === "assistant" && (
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-background-elevated">
                  <img src={logoIconSvg} alt="Mitable" className="w-3 h-3" />
                </div>
              )}

              {/* Content */}
              <div className={`max-w-[85%] ${message.role === "user" ? "ml-auto" : ""}`}>
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

                {/* Apply suggestion button or applied checkmark */}
                {message.suggestedEdit && !message.isTyping && (
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleApply(message.id, message.suggestedEdit!)}
                      className="gap-2 text-xs h-7 border-primary/30 hover:bg-primary/10 hover:text-primary"
                    >
                      <Wand2 size={12} />
                      Apply suggestion
                    </Button>
                  </div>
                )}
                {message.applied && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-green-400">
                    <Check size={12} />
                    Suggestion applied
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-white/10">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <textarea
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-resize up to 3 lines then scroll
              const el = e.target;
              el.style.height = "auto";
              const maxHeight = 76; // ~3 lines + padding
              const clamped = Math.min(el.scrollHeight, maxHeight);
              el.style.height = `${clamped}px`;
              el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask AI to help edit..."
            disabled={isLoading}
            className="flex-1 bg-background-elevated border border-border-subtle rounded-2xl px-4 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all disabled:opacity-50 resize-none overflow-y-hidden"
            style={{ maxHeight: "76px" }}
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
      </div>
    </div>
  );
}
