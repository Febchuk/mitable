import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Square, Check, X, ExternalLink, Pencil, Zap, CalendarDays, Lightbulb } from "lucide-react";
import AgentMessage, { AgentThinking } from "./AgentMessage";
import { useUser } from "../../../../context/UserContext";

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
    icon: Pencil,
    label: "Write",
    prompt: "Draft a standup update based on my recent work sessions.",
  },
  {
    icon: Zap,
    label: "Automate",
    prompt: "What repetitive tasks from my recent work could you help me automate?",
  },
  {
    icon: CalendarDays,
    label: "Review",
    prompt: "Review my work this week and highlight key accomplishments.",
  },
  {
    icon: Lightbulb,
    label: "Suggest",
    prompt: "Suggest ways I can be more productive based on my work patterns.",
  },
];

function getGreeting(): string {
  return "Hello";
}

export default function AgentView() {
  const { user } = useUser();
  const firstName = user?.firstName || user?.name?.split(" ")[0] || "";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTool, setActiveTool] = useState<{ name: string; detail?: string } | null>(null);
  const [pendingPlan, setPendingPlan] = useState(false);
  const [conversationId] = useState(() => generateId());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const turnStartIndexRef = useRef<number>(0);

  const [bridgeConnected, setBridgeConnected] = useState<boolean | null>(null);

  useEffect(() => {
    window.consoleAPI?.getBrowserBridgeStatus().then(setBridgeConnected);
    const unsub = window.consoleAPI?.onBrowserBridgeConnectionUpdate(setBridgeConnected);
    return () => unsub?.();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!window.consoleAPI?.onAgentMessageEvent) return;

    const unsubscribe = window.consoleAPI.onAgentMessageEvent((event) => {
      switch (event.type) {
        case "result":
          setActiveTool(null);
          setMessages((prev) => [
            ...prev,
            { id: generateId(), role: "assistant", content: String(event.data) },
          ]);
          setIsLoading(false);
          break;
        case "plan_proposed":
          setActiveTool(null);
          setMessages((prev) => {
            const startIdx = turnStartIndexRef.current;
            const beforeTurn = prev.slice(0, startIdx);
            const duringTurn = prev.slice(startIdx);
            const nonStreamed = duringTurn.filter(
              (m) => m.role !== "assistant" && m.role !== "tool"
            );
            return [
              ...beforeTurn,
              ...nonStreamed,
              { id: generateId(), role: "assistant" as const, content: String(event.data), isPlan: true },
            ];
          });
          setPendingPlan(true);
          setIsLoading(false);
          break;
        case "assistant_text":
          setActiveTool(null);
          setMessages((prev) => [
            ...prev,
            { id: generateId(), role: "assistant", content: String(event.data) },
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
            { id: generateId(), role: "error", content: String(event.data) },
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
        turnStartIndexRef.current = next.length;
        return next;
      });
      setInput("");
      setIsLoading(true);

      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }

      try {
        await window.consoleAPI?.agentSendMessage(conversationId, text.trim());
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: generateId(), role: "error", content: "Failed to send message. Please try again." },
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
    setMessages((prev) => {
      turnStartIndexRef.current = prev.length;
      return prev;
    });
    try {
      await window.consoleAPI?.agentApprovePlan(conversationId, true);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: "error", content: "Failed to execute plan. Please try again." },
      ]);
      setIsLoading(false);
    }
  }, [conversationId]);

  const handleDeny = useCallback(() => {
    setPendingPlan(false);
    window.consoleAPI?.agentApprovePlan(conversationId, false);
    setMessages((prev) => [
      ...prev,
      { id: generateId(), role: "assistant", content: "Plan cancelled. What would you like to do instead?" },
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

  // ── Shared input area ──────────────────────────────────────────────
  const renderInput = (variant: "center" | "bottom") => {
    const isCenter = variant === "center";

    return (
      <div
        style={{
          position: "relative",
          border: "0.5px solid rgba(236, 232, 224, 0.1)",
          borderRadius: 14,
          background: "rgba(236, 232, 224, 0.03)",
          padding: "12px 14px",
          display: "flex",
          alignItems: "flex-end",
          gap: 10,
          width: "100%",
          maxWidth: isCenter ? 560 : undefined,
          transition: "border-color 0.15s ease",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "rgba(155, 132, 232, 0.3)";
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            e.currentTarget.style.borderColor = "rgba(236, 232, 224, 0.1)";
          }
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={pendingPlan ? "Accept or deny the plan above..." : "What can I help with?"}
          rows={1}
          disabled={inputDisabled}
          style={{
            flex: 1,
            minHeight: 24,
            maxHeight: 128,
            resize: "none",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#ECE8E0",
            fontSize: 14,
            fontFamily: "var(--font-sans)",
            lineHeight: "1.5",
            overflow: input.split("\n").length > 4 ? "auto" : "hidden",
            opacity: inputDisabled ? 0.4 : 1,
            cursor: inputDisabled ? "not-allowed" : "text",
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
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "#E87474",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Square size={13} color="#fff" />
          </button>
        ) : (
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || inputDisabled}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: input.trim() && !inputDisabled ? "#9B84E8" : "rgba(236, 232, 224, 0.06)",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: input.trim() && !inputDisabled ? "pointer" : "default",
              flexShrink: 0,
              transition: "background 0.15s ease",
              opacity: input.trim() && !inputDisabled ? 1 : 0.4,
            }}
          >
            <ArrowUp size={15} color="#fff" />
          </button>
        )}
      </div>
    );
  };

  // ── Empty state ────────────────────────────────────────────────────
  if (isEmpty) {
    return (
      <div
        className="app-no-drag"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "calc(100vh - 120px)",
          gap: 28,
          paddingBottom: 40,
        }}
      >
        {/* Greeting */}
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 28,
            color: "#ECE8E0",
            fontWeight: 400,
            letterSpacing: "-0.3px",
            margin: 0,
            textAlign: "center",
          }}
        >
          {getGreeting()}{firstName ? `, ${firstName}` : ""}.
        </h1>

        {/* Centered input */}
        {renderInput("center")}

        {/* Suggestion chips */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {SUGGESTION_CHIPS.map((chip) => (
            <SuggestionChip
              key={chip.label}
              icon={chip.icon}
              label={chip.label}
              onClick={() => sendMessage(chip.prompt)}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Chat state ─────────────────────────────────────────────────────
  return (
    <div
      className="app-no-drag"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "calc(100vh - 120px)",
      }}
    >
      {/* Browser bridge status */}
      {bridgeConnected !== null && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            fontSize: 11,
            borderRadius: 8,
            marginBottom: 12,
            background: bridgeConnected
              ? "rgba(74, 222, 128, 0.06)"
              : "rgba(251, 191, 36, 0.06)",
            color: bridgeConnected ? "#4ade80" : "#fbbf24",
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: bridgeConnected ? "#4ade80" : "#fbbf24",
              flexShrink: 0,
            }}
          />
          <span>{bridgeConnected ? "Browser bridge connected" : "Browser extension not connected"}</span>
          {!bridgeConnected && (
            <>
              <span style={{ opacity: 0.3 }}>·</span>
              <button
                onClick={() =>
                  window.open(
                    "https://pub-56941275957b42049f3bad9b4bf1daa9.r2.dev/mitable-browser-bridge.zip",
                    "_blank"
                  )
                }
                style={{
                  background: "none",
                  border: "none",
                  color: "inherit",
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                  cursor: "pointer",
                  fontSize: 11,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: 0,
                }}
              >
                Download
                <ExternalLink size={10} />
              </button>
            </>
          )}
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1 }}>
        {messages.map((msg) => (
          <AgentMessage
            key={msg.id}
            role={msg.role}
            content={msg.content}
            toolName={msg.toolName}
            isPlan={msg.isPlan}
          />
        ))}
        {isLoading && (
          <AgentThinking toolName={activeTool?.name} toolDetail={activeTool?.detail} />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Plan approval */}
      {pendingPlan && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderRadius: 10,
            border: "0.5px solid rgba(155, 132, 232, 0.15)",
            background: "rgba(155, 132, 232, 0.04)",
            marginTop: 12,
          }}
        >
          <span style={{ flex: 1, fontSize: 12, color: "#9B9689" }}>Execute this plan?</span>
          <button
            onClick={handleDeny}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 12px",
              borderRadius: 7,
              border: "0.5px solid rgba(236, 232, 224, 0.1)",
              background: "transparent",
              color: "#9B9689",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <X size={13} />
            Deny
          </button>
          <button
            onClick={handleApprove}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 12px",
              borderRadius: 7,
              border: "none",
              background: "#9B84E8",
              color: "#fff",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <Check size={13} />
            Accept
          </button>
        </div>
      )}

      {/* Bottom input */}
      <div
        style={{
          position: "sticky",
          bottom: -20,
          background: "#1A1916",
          paddingTop: 16,
          paddingBottom: 20,
          marginTop: 16,
        }}
      >
        {renderInput("bottom")}
      </div>
    </div>
  );
}

// ── Suggestion chip ────────────────────────────────────────────────
function SuggestionChip({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "8px 14px",
        borderRadius: 8,
        border: "0.5px solid rgba(236, 232, 224, 0.1)",
        background: "transparent",
        color: "#9B9689",
        fontSize: 13,
        fontFamily: "var(--font-sans)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(236, 232, 224, 0.05)";
        e.currentTarget.style.color = "#ECE8E0";
        e.currentTarget.style.borderColor = "rgba(236, 232, 224, 0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "#9B9689";
        e.currentTarget.style.borderColor = "rgba(236, 232, 224, 0.1)";
      }}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}
