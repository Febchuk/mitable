import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowUp, Square, Pencil, Zap, CalendarDays, Lightbulb, Settings } from "lucide-react";
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
} from "../../../../hooks/queries/agent-chats";
import { askAgentQuery } from "../../../../services/agentChatService";
import { trackEvent } from "@/lib/posthog";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "error";
  content: string;
  toolName?: string;
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
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function AgentView() {
  const { user } = useUser();
  const navigate = useNavigate();
  const { chatId } = useParams<{ chatId: string }>();
  const firstName = user?.firstName || user?.name?.split(" ")[0] || "";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentProgress, setAgentProgress] = useState<{ phase: string; tool?: string } | null>(null);
  const [showProviderModal, setShowProviderModal] = useState(false);
  // API hooks
  const { data: conversations = [] } = useAgentChats();
  const createChat = useCreateAgentChat();
  const deleteChat = useDeleteAgentChat();
  const renameChat = useRenameAgentChat();
  const addMessage = useAddAgentMessage();

  // The active conversation ID — from URL or null (new chat)
  const activeIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const layer1AbortRef = useRef<AbortController | null>(null);
  const progressCleanupRef = useRef<(() => void) | null>(null);

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
    setAgentProgress(null);
  }, [chatId, chatData]);

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

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      // Check if a BYOK AI provider is configured
      try {
        const config = await window.consoleAPI?.loadInferenceConfig?.();
        if (!config) {
          setShowProviderModal(true);
          return;
        }
      } catch {
        /* allow to proceed if check fails */
      }

      // Create conversation on first message if this is a new chat
      let convId = activeIdRef.current ?? "";
      const isNew = !convId;
      if (isNew) {
        convId = generateId();
        activeIdRef.current = convId;
        navigate(`/agent/${convId}`, { replace: true });
      }

      const trimmed = text.trim();
      trackEvent("agent_message_sent", {
        message_length: trimmed.length,
        is_new_conversation: isNew,
      });

      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: trimmed,
      };

      setMessages((prev) => [...prev, userMessage]);
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
        const abort = new AbortController();
        layer1AbortRef.current = abort;

        // Listen for real-time progress from the RLM loop
        setAgentProgress({ phase: "thinking" });
        progressCleanupRef.current =
          window.consoleAPI?.onAgentProgress?.((event) => {
            setAgentProgress({ phase: event.phase, tool: event.tool });
          }) ?? null;

        const result = await askAgentQuery(trimmed, convId, abort.signal);

        // Clean up progress listener
        progressCleanupRef.current?.();
        progressCleanupRef.current = null;
        setAgentProgress(null);
        layer1AbortRef.current = null;

        // Guard: only apply if this conversation is still active
        if (activeIdRef.current !== convId) return;

        if (result.response) {
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
    [isLoading, navigate, createChat, addMessage]
  );

  const handleCancel = useCallback(() => {
    layer1AbortRef.current?.abort();
    layer1AbortRef.current = null;
    progressCleanupRef.current?.();
    progressCleanupRef.current = null;
    setIsLoading(false);
    setAgentProgress(null);
  }, []);

  const handleDeleteChat = useCallback(
    (id: string) => {
      if (id === activeIdRef.current) {
        layer1AbortRef.current?.abort();
        layer1AbortRef.current = null;
        progressCleanupRef.current?.();
        progressCleanupRef.current = null;
        setIsLoading(false);
        setAgentProgress(null);
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

  const isEmpty = messages.length === 0 && !chatId;
  const inputDisabled = isLoading;

  // ── Shared input area ──────────────────────────────────────────────
  const renderInput = (variant: "center" | "bottom") => {
    const isCenter = variant === "center";

    return (
      <div
        style={{
          position: "relative",
          border: "var(--border-subtle)",
          borderRadius: 14,
          background: "rgba(var(--ui-rgb), 0.03)",
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
          placeholder="What can I help with?"
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
            color: "var(--text-primary)",
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
              background: "rgba(var(--ui-rgb), 0.06)",
              border: "var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              cursor: "pointer",
              flexShrink: 0,
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-primary)",
              fontFamily: "var(--font-sans)",
              transition: "background 0.12s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.06)";
            }}
          >
            <Square size={10} fill="var(--text-primary)" color="var(--text-primary)" />
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
                input.trim() && !inputDisabled ? "var(--mi-accent)" : "rgba(var(--ui-rgb), 0.06)",
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
            <ArrowUp size={15} color="var(--bg-base)" />
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
              color: "var(--text-primary)",
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
        {/* Scrollable messages */}
        <div ref={scrollContainerRef} style={{ flex: 1, overflowY: "auto", padding: "0 40px" }}>
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            {messages.map((msg) => (
              <AgentMessage
                key={msg.id}
                role={msg.role}
                content={msg.content}
                toolName={msg.toolName}
              />
            ))}
            {isLoading && <AgentThinking phase={agentProgress?.phase} tool={agentProgress?.tool} />}
          </div>
        </div>

        {/* Bottom input */}
        <div
          style={{
            background: "var(--bg-base)",
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

      {/* No AI provider modal */}
      {showProviderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0, 0, 0, 0.5)" }}
          onClick={() => setShowProviderModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl p-6 space-y-4"
            style={{
              background: "var(--bg-raised)",
              border: "0.5px solid rgba(var(--ui-rgb), 0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: "rgba(var(--mi-accent-rgb), 0.12)" }}
              >
                <Settings size={20} style={{ color: "var(--mi-accent)" }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  AI Provider Required
                </h3>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Add your API key to get started
                </p>
              </div>
            </div>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              The agent needs an AI provider to respond. Go to{" "}
              <strong style={{ color: "var(--text-primary)" }}>Settings</strong> and add your API
              key for Google, OpenAI, or Anthropic.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowProviderModal(false)}
                className="flex-1 px-4 py-2 text-sm rounded-lg transition-colors"
                style={{
                  background: "var(--bg-overlay)",
                  color: "var(--text-secondary)",
                  borderWidth: "0.5px",
                  borderStyle: "solid",
                  borderColor: "rgba(var(--ui-rgb), 0.10)",
                }}
              >
                Later
              </button>
              <button
                onClick={() => {
                  setShowProviderModal(false);
                  navigate("/profile");
                }}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                style={{ background: "var(--mi-accent)", color: "var(--bg-base)" }}
              >
                Open Settings
              </button>
            </div>
          </div>
        </div>
      )}
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
        border: "var(--border-subtle)",
        background: "transparent",
        color: "var(--text-secondary)",
        fontSize: 13,
        fontFamily: "var(--font-sans)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.05)";
        e.currentTarget.style.color = "var(--text-primary)";
        e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-secondary)";
        e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.1)";
      }}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}
