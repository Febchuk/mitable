import { useState } from "react";
import { Send, Sparkles, X } from "lucide-react";
import type { ChatMessage } from "./mockData";

interface ChatPanelProps {
  messages: ChatMessage[];
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

export default function ChatPanel({ messages, onClose }: ChatPanelProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Static prototype — no actual submission
    setInput("");
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
          />
          <button
            type="submit"
            className="p-1.5 rounded-md text-text-tertiary hover:text-indigo-light hover:bg-indigo/10 transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}
