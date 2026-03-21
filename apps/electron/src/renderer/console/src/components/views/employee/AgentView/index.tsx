import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowUp,
  Square,
  Check,
  X,
  ExternalLink,
  Pencil,
  Zap,
  CalendarDays,
  Lightbulb,
} from "lucide-react";
import AgentMessage, { AgentThinking } from "./AgentMessage";
import ChatHistorySidebar from "./ChatHistorySidebar";
import { useUser } from "../../../../context/UserContext";
import {
  useAgentChats,
  useAgentChat,
  useCreateAgentChat,
  useDeleteAgentChat,
  useRenameAgentChat,
  useAddAgentMessage,
  useUpdateAgentChatSession,
} from "../../../../hooks/queries/agent-chats";
import { askAgentQuery } from "../../../../services/agentChatService";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "error";
  content: string;
  toolName?: string;
  isPlan?: boolean;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
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
  const navigate = useNavigate();
  const { chatId } = useParams<{ chatId: string }>();
  const firstName = user?.firstName || user?.name?.split(" ")[0] || "";
  const [agentAllowed, setAgentAllowed] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTool, setActiveTool] = useState<{ name: string; detail?: string } | null>(null);
  const [pendingPlan, setPendingPlan] = useState(false);
  // API hooks
  const { data: conversations = [] } = useAgentChats();
  const createChat = useCreateAgentChat();
  const deleteChat = useDeleteAgentChat();
  const renameChat = useRenameAgentChat();
  const addMessage = useAddAgentMessage();
  const updateSession = useUpdateAgentChatSession();

  // The active conversation ID — from URL or null (new chat)
  const activeIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const turnStartIndexRef = useRef<number>(0);
  const layer1AbortRef = useRef<AbortController | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnToolCallsRef = useRef<Array<{ name: string; detail?: string }>>([]);

  // Load conversation from DB when URL changes
  const { data: chatData } = useAgentChat(chatId);

  useEffect(() => {
    if (chatId && chatId === activeIdRef.current) return;

    if (chatId) {
      if (chatData) {
        setMessages(
          chatData.messages.map((m) => ({
            id: m.id,
            role: m.role as ChatMessage["role"],
            content: m.content,
          }))
        );
        activeIdRef.current = chatId;
      }
    } else {
      setMessages([]);
      activeIdRef.current = null;
    }
    setIsLoading(false);
    setPendingPlan(false);
    setActiveTool(null);
  }, [chatId, chatData]);

  // Route guard: redirect if agent feature is disabled
  useEffect(() => {
    if (!user?.id) return;
    window.consoleAPI?.getAgentEnabled(user.id).then((enabled) => {
      if (!enabled) {
        navigate("/calendar", { replace: true });
      } else {
        setAgentAllowed(true);
      }
    });
  }, [user?.id, navigate]);

  const [bridgeConnected, setBridgeConnected] = useState<boolean | null>(null);

  useEffect(() => {
    window.consoleAPI?.getBrowserBridgeStatus().then(setBridgeConnected);
    const unsub = window.consoleAPI?.onBrowserBridgeConnectionUpdate(setBridgeConnected);
    return () => unsub?.();
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
    // Scroll the messages container to bottom — use scrollTop instead of
    // scrollIntoView to avoid bubbling up and shifting ancestor containers.
    const el = scrollContainerRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      });
    }
  }, [messages]);

  useEffect(() => {
    if (!window.consoleAPI?.onAgentMessageEvent) return;

    const unsubscribe = window.consoleAPI.onAgentMessageEvent((event) => {
      const convId = activeIdRef.current;

      switch (event.type) {
        case "result": {
          setActiveTool(null);
          const resultText = String(event.data);
          const toolCalls = [...turnToolCallsRef.current];
          turnToolCallsRef.current = [];
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
              { id: generateId(), role: "assistant" as const, content: resultText },
            ];
          });
          setIsLoading(false);
          // Save assistant message to DB
          if (convId) {
            addMessage.mutate({
              conversationId: convId,
              role: "assistant",
              content: resultText,
              toolCalls,
            });
          }
          break;
        }
        case "plan_proposed": {
          setActiveTool(null);
          const planText = String(event.data);
          const toolCalls = [...turnToolCallsRef.current];
          turnToolCallsRef.current = [];
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
              { id: generateId(), role: "assistant" as const, content: planText, isPlan: true },
            ];
          });
          setPendingPlan(true);
          setIsLoading(false);
          // Save plan message to DB
          if (convId) {
            addMessage.mutate({
              conversationId: convId,
              role: "plan",
              content: planText,
              toolCalls,
            });
          }
          break;
        }
        case "assistant_text":
          setActiveTool(null);
          setMessages((prev) => [
            ...prev,
            { id: generateId(), role: "assistant", content: String(event.data) },
          ]);
          break;
        case "tool_use": {
          const toolData = event.data as { name?: string; detail?: string };
          if (toolData?.name) {
            turnToolCallsRef.current.push({ name: toolData.name, detail: toolData.detail });
          }
          setActiveTool(toolData?.name ? { name: toolData.name, detail: toolData.detail } : null);
          break;
        }
        case "init": {
          const initData = event.data as { sessionId?: string };
          if (convId && initData?.sessionId) {
            updateSession.mutate({ id: convId, sessionId: initData.sessionId });
          }
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
          turnToolCallsRef.current = [];
          // Save error to DB
          if (convId) {
            addMessage.mutate({
              conversationId: convId,
              role: "error",
              content: String(event.data),
            });
          }
          break;
      }
    });

    return unsubscribe;
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading || pendingPlan) return;

      // Create conversation on first message if this is a new chat
      let convId = activeIdRef.current ?? "";
      const isNew = !convId;
      if (isNew) {
        convId = generateId();
        activeIdRef.current = convId;
        navigate(`/agent/${convId}`, { replace: true });
      }

      const trimmed = text.trim();
      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: trimmed,
      };

      turnToolCallsRef.current = [];
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

      // Ensure conversation exists in DB before saving the message
      if (isNew) {
        await createChat.mutateAsync({ id: convId, title: "New chat" });
      }
      addMessage.mutate({ conversationId: convId, role: "user", content: trimmed });

      try {
        // Always try Layer 1 (lightweight RLM) first
        const abort = new AbortController();
        layer1AbortRef.current = abort;

        // Cycling progress messages while the RLM works
        const progressSteps = [
          "Searching your activity...",
          "Fetching sessions & meetings...",
          "Analyzing daily summaries...",
          "Reviewing meeting notes...",
          "Compiling insights...",
          "Synthesizing patterns...",
        ];
        let stepIdx = 0;
        setActiveTool({ name: "layer1_progress", detail: progressSteps[0] });
        progressTimerRef.current = setInterval(() => {
          stepIdx = Math.min(stepIdx + 1, progressSteps.length - 1);
          setActiveTool({ name: "layer1_progress", detail: progressSteps[stepIdx] });
        }, 4000);

        const result = await askAgentQuery(trimmed, convId, abort.signal);

        // Clean up progress timer
        if (progressTimerRef.current) {
          clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
        }
        setActiveTool(null);
        layer1AbortRef.current = null;

        // Guard: only apply if this conversation is still active
        if (activeIdRef.current !== convId) return;

        if (result.escalate) {
          // Layer 1 can't handle it — fall back to Layer 2 (Claude Code SDK)
          await window.consoleAPI?.agentSendMessage(convId, trimmed);
        } else if (result.response) {
          // Layer 1 handled it
          const assistantMsg: ChatMessage = {
            id: generateId(),
            role: "assistant",
            content: result.response,
          };
          setMessages((prev) => [...prev, assistantMsg]);
          setIsLoading(false);

          addMessage.mutate({
            conversationId: convId,
            role: "assistant",
            content: result.response,
          });
        }
      } catch (err) {
        // Don't show error if we intentionally aborted
        if (err instanceof DOMException && err.name === "AbortError") return;
        setMessages((prev) => [
          ...prev,
          { id: generateId(), role: "error", content: "Failed to send message. Please try again." },
        ]);
        setIsLoading(false);
      }
    },
    [isLoading, pendingPlan, navigate, createChat, addMessage]
  );

  const handleCancel = useCallback(() => {
    window.consoleAPI?.agentCancel();
    layer1AbortRef.current?.abort();
    layer1AbortRef.current = null;
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setIsLoading(false);
    setActiveTool(null);
  }, []);

  const handleApprove = useCallback(async () => {
    const convId = activeIdRef.current;
    if (!convId) return;
    setPendingPlan(false);
    setIsLoading(true);
    setMessages((prev) => {
      turnStartIndexRef.current = prev.length;
      return prev;
    });
    try {
      await window.consoleAPI?.agentApprovePlan(convId, true);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: "error", content: "Failed to execute plan. Please try again." },
      ]);
      setIsLoading(false);
    }
  }, []);

  const handleDeny = useCallback(() => {
    const convId = activeIdRef.current;
    if (!convId) return;
    setPendingPlan(false);
    window.consoleAPI?.agentApprovePlan(convId, false);
    setMessages((prev) => [
      ...prev,
      {
        id: generateId(),
        role: "assistant",
        content: "Plan cancelled. What would you like to do instead?",
      },
    ]);
  }, []);

  const handleDeleteChat = useCallback(
    (id: string) => {
      if (id === activeIdRef.current) {
        window.consoleAPI?.agentCancel();
        layer1AbortRef.current?.abort();
        layer1AbortRef.current = null;
        if (progressTimerRef.current) {
          clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
        }
        setIsLoading(false);
        setActiveTool(null);
        setPendingPlan(false);
        setMessages([]);
        navigate("/agent", { replace: true });
      }
      deleteChat.mutate(id);
    },
    [navigate, deleteChat]
  );

  const handleRenameChat = useCallback(
    (id: string, title: string) => {
      renameChat.mutate({ id, title });
    },
    [renameChat]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (agentAllowed === null) return null;

  const isEmpty = messages.length === 0 && !chatId;
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
          e.currentTarget.style.borderColor = "rgba(var(--mi-accent-rgb, 200,169,96), 0.3)";
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
              height: 30,
              padding: "0 12px",
              borderRadius: 8,
              background: "rgba(236, 232, 224, 0.06)",
              border: "0.5px solid rgba(236, 232, 224, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              cursor: "pointer",
              flexShrink: 0,
              fontSize: 12,
              fontWeight: 500,
              color: "#ECE8E0",
              fontFamily: "var(--font-sans)",
              transition: "background 0.12s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(236, 232, 224, 0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(236, 232, 224, 0.06)";
            }}
          >
            <Square size={10} fill="#ECE8E0" color="#ECE8E0" />
            Stop
          </button>
        ) : (
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || inputDisabled}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background:
                input.trim() && !inputDisabled ? "var(--mi-accent)" : "rgba(236, 232, 224, 0.06)",
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
            <ArrowUp size={15} color="#1A1916" />
          </button>
        )}
      </div>
    );
  };

  // ── Chat content area ──────────────────────────────────────────────
  const renderChat = () => {
    if (isEmpty) {
      return (
        <div
          className="app-no-drag"
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            flex: 1,
            gap: 28,
            paddingBottom: 40,
          }}
        >
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
            {getGreeting()}
            {firstName ? `, ${firstName}` : ""}.
          </h1>

          {renderInput("center")}

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

    return (
      <div
        className="app-no-drag"
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          fontFamily: "var(--font-sans)",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {bridgeConnected === false && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 10px",
              fontSize: 11,
              fontFamily: "var(--font-sans)",
              borderRadius: 6,
              marginBottom: 8,
              background: "rgba(236, 232, 224, 0.04)",
              color: "#9B9689",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#6B665C",
                flexShrink: 0,
              }}
            />
            <span>Browser extension not connected</span>
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
                color: "#9B9689",
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
          </div>
        )}

        {/* Scrollable messages */}
        <div ref={scrollContainerRef} style={{ flex: 1, overflowY: "auto", padding: "0 40px" }}>
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
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
          </div>
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
              border: "0.5px solid rgba(var(--mi-accent-rgb, 200,169,96), 0.15)",
              background: "rgba(var(--mi-accent-rgb, 200,169,96), 0.04)",
              margin: "12px 40px 0",
              maxWidth: 680,
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
                background: "var(--mi-accent)",
                color: "#1A1916",
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
            background: "#1A1916",
            padding: "16px 40px 20px",
            flexShrink: 0,
          }}
        >
          <div style={{ maxWidth: 680, margin: "0 auto" }}>{renderInput("bottom")}</div>
        </div>
      </div>
    );
  };

  // ── Layout: sidebar + chat ─────────────────────────────────────────
  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
      <ChatHistorySidebar
        conversations={conversations}
        onDelete={handleDeleteChat}
        onRename={handleRenameChat}
      />
      {renderChat()}
    </div>
  );
}

// ── Suggestion chip ────────────────────────────────────────────────
function SuggestionChip({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<Record<string, unknown>>;
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
