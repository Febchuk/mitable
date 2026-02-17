import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, X, Loader2 } from "lucide-react";
import { sendDashboardChat } from "@/console/src/services/adminService";
import type { DashboardPeriod } from "@/console/src/services/adminService";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatPanelProps {
  period: DashboardPeriod;
  onClose?: () => void;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-indigo text-white"
            : "bg-canvas-overlay text-text-primary border border-stroke-subtle"
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles size={12} className="text-indigo-light" />
            <span className="text-[10px] font-semibold text-indigo-light uppercase tracking-wider">
              Mitable AI
            </span>
          </div>
        )}
        <p className="whitespace-pre-wrap">{message.content}</p>
        <span
          className={`block text-[10px] mt-1 ${isUser ? "text-white/50" : "text-text-tertiary"}`}
        >
          {message.timestamp}
        </span>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm bg-canvas-overlay border border-stroke-subtle">
        <div className="flex items-center gap-1.5 mb-1">
          <Sparkles size={12} className="text-indigo-light" />
          <span className="text-[10px] font-semibold text-indigo-light uppercase tracking-wider">
            Mitable AI
          </span>
        </div>
        <div className="flex items-center gap-1.5 py-1">
          <Loader2 size={14} className="animate-spin text-text-tertiary" />
          <span className="text-xs text-text-tertiary">Analyzing your data...</span>
        </div>
      </div>
    </div>
  );
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Welcome to your dashboard. I can help you understand trends, drill into any metric, or compare time periods. Ask me anything about your team's activity data.",
  timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
};

export default function ChatPanel({ period, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const now = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: now,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      // Build message history for the API (exclude welcome, only role+content)
      const apiMessages = [...messages.filter((m) => m.id !== "welcome"), userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await sendDashboardChat(apiMessages, period);

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: response.message,
        timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (error) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "Sorry, I couldn't process that request. Please try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full rounded-xl border border-stroke-subtle bg-canvas-raised overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-stroke-subtle shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-light" />
            <h3 className="text-sm font-semibold text-text-primary">AI Assistant</h3>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-canvas-overlay transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <p className="text-[11px] text-text-tertiary mt-0.5">
          Ask about team productivity, drill into users, or generate reports
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-stroke-subtle shrink-0">
        <div className="flex items-center gap-2 bg-canvas-overlay rounded-lg border border-stroke-subtle px-3 py-2 focus-within:border-indigo/50 transition-colors">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your team..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="p-1.5 rounded-md text-text-tertiary hover:text-indigo-light hover:bg-indigo/10 transition-colors disabled:opacity-30"
          >
            <Send size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}
