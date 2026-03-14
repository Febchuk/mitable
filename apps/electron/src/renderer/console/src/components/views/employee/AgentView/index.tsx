import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Square, Bot, Check, X } from "lucide-react";
import AgentMessage, { AgentThinking } from "./AgentMessage";

// Simple UUID fallback for renderer
function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "error";
  content: string;
  toolName?: string;
  isPlan?: boolean;
}

const SUGGESTION_CHIPS = [
  {
    label: "What did I work on today?",
    prompt: "What did I work on today? Summarize my sessions.",
  },
  {
    label: "Draft a standup update",
    prompt: "Draft a standup update based on my recent work sessions.",
  },
  { label: "List files in home", prompt: "List the files in my home directory." },
];

export default function AgentView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTool, setActiveTool] = useState<{ name: string; detail?: string } | null>(null);
  const [pendingPlan, setPendingPlan] = useState(false);
  const [conversationId] = useState(() => generateId());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Track where the current turn's messages start so we can dedup on plan_proposed
  const turnStartIndexRef = useRef<number>(0);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Listen for agent events from main process
  useEffect(() => {
    if (!window.consoleAPI?.onAgentMessageEvent) return;

    const unsubscribe = window.consoleAPI.onAgentMessageEvent((event) => {
      switch (event.type) {
        case "result":
          setActiveTool(null);
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: "assistant",
              content: String(event.data),
            },
          ]);
          setIsLoading(false);
          break;
        case "plan_proposed":
          // Replace streamed assistant_text messages from this turn with the clean plan
          setActiveTool(null);
          setMessages((prev) => {
            const startIdx = turnStartIndexRef.current;
            // Keep messages before this turn, drop intermediate assistant_text from this turn
            const beforeTurn = prev.slice(0, startIdx);
            const duringTurn = prev.slice(startIdx);
            const nonStreamed = duringTurn.filter(
              (m) => m.role !== "assistant" && m.role !== "tool"
            );
            return [
              ...beforeTurn,
              ...nonStreamed,
              {
                id: generateId(),
                role: "assistant" as const,
                content: String(event.data),
                isPlan: true,
              },
            ];
          });
          setPendingPlan(true);
          setIsLoading(false);
          break;
        case "assistant_text":
          // Intermediate text from agent (e.g. "Let me search...") — show it but keep loading
          setActiveTool(null);
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: "assistant",
              content: String(event.data),
            },
          ]);
          break;
        case "tool_use": {
          const toolData = event.data as { name?: string; detail?: string };
          setActiveTool(toolData?.name ? { name: toolData.name, detail: toolData.detail } : null);
          break;
        }
        case "error":
          setActiveTool(null);
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: "error",
              content: String(event.data),
            },
          ]);
          setIsLoading(false);
          setPendingPlan(false);
          break;
      }
    });

    return unsubscribe;
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading || pendingPlan) return;

      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: text.trim(),
      };

      setMessages((prev) => {
        const next = [...prev, userMessage];
        // Mark where this turn's messages start (after the user message)
        turnStartIndexRef.current = next.length;
        return next;
      });
      setInput("");
      setIsLoading(true);

      try {
        await window.consoleAPI?.agentSendMessage(conversationId, text.trim());
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: "error",
            content: "Failed to send message. Please try again.",
          },
        ]);
        setIsLoading(false);
      }
    },
    [conversationId, isLoading, pendingPlan]
  );

  const handleCancel = useCallback(() => {
    window.consoleAPI?.agentCancel();
    setIsLoading(false);
  }, []);

  const handleApprove = useCallback(async () => {
    setPendingPlan(false);
    setIsLoading(true);
    // Mark turn start for Phase 2 messages
    setMessages((prev) => {
      turnStartIndexRef.current = prev.length;
      return prev;
    });
    try {
      await window.consoleAPI?.agentApprovePlan(conversationId, true);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: "error",
          content: "Failed to execute plan. Please try again.",
        },
      ]);
      setIsLoading(false);
    }
  }, [conversationId]);

  const handleDeny = useCallback(() => {
    setPendingPlan(false);
    window.consoleAPI?.agentApprovePlan(conversationId, false);
    setMessages((prev) => [
      ...prev,
      {
        id: generateId(),
        role: "assistant",
        content: "Plan cancelled. What would you like to do instead?",
      },
    ]);
  }, [conversationId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0;
  const inputDisabled = isLoading || pendingPlan;

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10">
              <Bot className="h-7 w-7 text-violet-500" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold">Mitable Agent</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ask me about your work, draft messages, or run tasks.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTION_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => sendMessage(chip.prompt)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="pb-4">
            {messages.map((msg) => (
              <AgentMessage
                key={msg.id}
                role={msg.role}
                content={msg.content}
                toolName={msg.toolName}
                isPlan={msg.isPlan}
              />
            ))}
            {isLoading && <AgentThinking toolName={activeTool?.name} toolDetail={activeTool?.detail} />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Plan approval bar */}
      {pendingPlan && (
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2 bg-muted/30">
          <span className="mr-auto text-xs text-muted-foreground">Execute this plan?</span>
          <button
            onClick={handleDeny}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Deny
          </button>
          <button
            onClick={handleApprove}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700"
          >
            <Check className="h-3.5 w-3.5" />
            Accept
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border p-3">
        <div className="relative flex items-end gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pendingPlan ? "Accept or deny the plan above..." : "Ask the agent anything..."}
            rows={1}
            disabled={inputDisabled}
            className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              height: "auto",
              overflow: input.split("\n").length > 4 ? "auto" : "hidden",
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 128) + "px";
            }}
          />
          {isLoading ? (
            <button
              onClick={handleCancel}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || inputDisabled}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
