import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Sparkles, ChevronDown, Plus, MessageSquare } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface SerializedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface Thread {
  id: string;
  title: string;
  messages: SerializedMessage[];
  createdAt: string;
  updatedAt: string;
}

// ── LocalStorage helpers ──────────────────────────────────────
const STORAGE_KEY = "mitable-ask-threads";

function loadThreads(): Thread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveThreads(threads: Thread[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
}

function threadTitle(messages: SerializedMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New conversation";
  return first.content.length > 40 ? first.content.slice(0, 40) + "…" : first.content;
}

function serializeMessages(msgs: Message[]): SerializedMessage[] {
  return msgs.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() }));
}

function deserializeMessages(msgs: SerializedMessage[]): Message[] {
  return msgs.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
}

// ── Suggestion chips ──────────────────────────────────────────
const suggestionChips: { label: string; prompt: string }[] = [
  {
    label: "Team insights",
    prompt: "How is the engineering team doing this week? Any trends or concerns?",
  },
  {
    label: "Sophie's performance",
    prompt: "How is Sophie Anderson performing relative to the team average this month?",
  },
  {
    label: "James vs team average",
    prompt: "Compare James Wilson's activity to the org average — where does he stand?",
  },
];

// ── Mock AI responses ─────────────────────────────────────────
const mockResponses: Record<string, string> = {
  default: `Based on the data I have access to, here's what I can tell you:

**Org Overview (This Week)**
- Average focus time across the team: **4.2h/day**
- Meeting load: **1.8h/day** (↓ 12% from last week)
- Most active contributor: **Billy TheKid** — 10.5h of technical writing
- Needs attention: **Sophie Anderson** is still ramping up — 0 docs created, 8 questions asked

Would you like me to drill into any of these areas?`,
};

function getMockResponse(query: string): string {
  const q = query.toLowerCase();

  if (q.includes("compare") || q.includes("vs")) {
    return `**Comparison: Ethan Miller vs Sophie Anderson**

| Metric | Ethan Miller | Sophie Anderson | Org Avg |
|--------|-------------|-----------------|---------|
| Focus Time | 3.8h/day | 5.3h/day | 4.2h/day |
| Docs Created | 2 this week | 3 this week | 2.4 |
| Meetings | 7 this week | 4 this week | 5.2 |
| Top Activity | Lead Follow-ups (40%) | Technical Writing (44%) | — |
| Mood | Collaborative | Focused | — |

**Key Insight:** Sophie is outperforming on focus time (+26% vs org avg) but Ethan is more meeting-heavy. Ethan's strength is cross-team collaboration — he's spending significant time on lead follow-ups, which is expected for his role.

**Recommendation:** Ethan might benefit from more protected focus blocks. His meeting load is 35% above average.`;
  }

  if (q.includes("trend") || q.includes("improvement") || q.includes("improve")) {
    return `**Focus Time Trends — Last 30 Days**

📈 **Most Improved:**
1. **Daniel Brown** — Focus time up **+42%** (2.8h → 4.0h/day). Shifted from meetings to report writing.
2. **Olivia Davis** — Up **+28%** after completing onboarding. Now averaging 3.5h/day on bug triage.
3. **Billy TheKid** — Steady at **4.5h/day**, consistently the highest on the team.

📉 **Declining:**
1. **Maya Johnson** — Down **-18%** this month. Sprint planning overhead has increased.
2. **James Wilson** — Down **-12%**. More time in customer support escalations.

**Pattern:** The team's overall focus time is trending up (+8% month-over-month), driven primarily by engineers finishing onboarding.`;
  }

  if (q.includes("health") || q.includes("burnout") || q.includes("risk") || q.includes("behind")) {
    return `**Team Health Check — Engineering**

🟢 **Healthy (4 members):**
- Billy TheKid, Daniel Brown, Olivia Davis, Sophie Anderson
- All above org average in focus time, meeting load within normal range

🟡 **Watch (2 members):**
- **Maya Johnson** — Meeting-heavy flag for 2 consecutive weeks. Sprint planning consuming 55% of her time.
- **James Wilson** — Support ticket volume spiked 3x this week. Risk of context-switching fatigue.

🔴 **Needs Attention (1 member):**
- **Sophie Anderson** — Ramping up, 0 docs created but 8 questions asked to Mitable AI. This is normal for week 2 but worth checking in.

**Org Comparison:**
- Engineering avg focus: **4.2h/day** (org avg: 3.8h)
- Engineering meeting load: **1.8h/day** (org avg: 2.1h)
- Engineering is **10% more focused** than the rest of the org.`;
  }

  if (q.includes("meeting") || q.includes("deep work") || q.includes("percentage")) {
    return `**Time Allocation Analysis — This Week vs Last Month**

| Category | This Week | Last Month Avg | Change |
|----------|-----------|----------------|--------|
| Deep Focus | **58%** (4.2h/day) | 52% (3.7h/day) | ↑ +6% |
| Meetings | **25%** (1.8h/day) | 29% (2.1h/day) | ↓ -4% |
| Support/Ops | **12%** (0.9h/day) | 14% (1.0h/day) | ↓ -2% |
| Other | **5%** (0.4h/day) | 5% (0.4h/day) | — |

**Insight:** The team is trending toward more focus time and fewer meetings. This aligns with the "No Meeting Wednesdays" policy introduced 3 weeks ago — Wednesdays now show **+40% focus time** compared to before.

**Top meeting consumers:** Maya Johnson (55%), Mike Jones (45%), Ethan Miller (38%)
**Most focused:** Sophie Anderson (72%), Billy TheKid (68%), Daniel Brown (65%)`;
  }

  return mockResponses.default;
}

// ── Components ────────────────────────────────────────────────
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`max-w-[75%] ${isUser ? "order-1" : "order-1"}`}>
        {!isUser && (
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-md bg-indigo/20 flex items-center justify-center">
              <Sparkles size={10} className="text-indigo-light" />
            </div>
            <span className="text-xs font-medium text-text-secondary">Mitable</span>
          </div>
        )}
        <div
          className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "bg-indigo text-white rounded-br-sm"
              : "bg-canvas-raised border border-stroke-subtle text-text-primary rounded-bl-sm"
          }`}
        >
          <div className="prose prose-sm prose-invert max-w-none [&_table]:text-xs [&_table]:w-full [&_th]:text-left [&_th]:py-1 [&_th]:pr-4 [&_td]:py-1 [&_td]:pr-4 [&_strong]:text-text-primary [&_h2]:text-base [&_h2]:mt-3 [&_h2]:mb-1">
            {message.content.split("\n").map((line, i) => {
              if (line.startsWith("| ") && line.endsWith(" |")) {
                const cells = line
                  .split("|")
                  .filter(Boolean)
                  .map((c) => c.trim());
                if (cells.every((c) => c.match(/^-+$/))) return null;
                const isHeader = i > 0 && message.content.split("\n")[i + 1]?.includes("---");
                return (
                  <div key={i} className="flex gap-0 text-xs">
                    {cells.map((cell, j) => (
                      <div
                        key={j}
                        className={`flex-1 py-1 ${isHeader ? "font-semibold text-text-secondary" : ""}`}
                      >
                        {cell}
                      </div>
                    ))}
                  </div>
                );
              }
              if (line.startsWith("**") && line.endsWith("**")) {
                return (
                  <p key={i} className="font-semibold mt-2 mb-1">
                    {line.replace(/\*\*/g, "")}
                  </p>
                );
              }
              if (
                line.startsWith("- ") ||
                line.startsWith("1. ") ||
                line.startsWith("2. ") ||
                line.startsWith("3. ")
              ) {
                return (
                  <p key={i} className="ml-2 my-0.5">
                    {line}
                  </p>
                );
              }
              if (line.trim() === "") return <br key={i} />;
              return (
                <p key={i} className="my-0.5">
                  {line}
                </p>
              );
            })}
          </div>
        </div>
        <p className={`text-[10px] text-text-tertiary mt-1 ${isUser ? "text-right" : ""}`}>
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

// ── Thread history dropdown ───────────────────────────────────
function ThreadDropdown({
  threads,
  activeThreadId,
  onSelect,
  onNew,
}: {
  threads: Thread[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const label = activeThread ? activeThread.title : "New conversation";

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-canvas-muted/50 transition-all duration-normal"
      >
        <span className="max-w-[180px] truncate">{label}</span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-normal ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 rounded-xl border border-stroke-subtle bg-canvas-raised shadow-xl z-50 overflow-hidden">
          {/* New conversation */}
          <button
            onClick={() => {
              onNew();
              setOpen(false);
            }}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-indigo-light hover:bg-indigo/5 transition-colors border-b border-stroke-subtle"
          >
            <Plus size={14} />
            New conversation
          </button>

          {/* Past threads */}
          {threads.length > 0 && (
            <div className="max-h-64 overflow-y-auto py-1">
              {threads
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                .map((thread) => {
                  const isActive = thread.id === activeThreadId;
                  const date = new Date(thread.updatedAt);
                  const timeStr = date.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  });
                  return (
                    <button
                      key={thread.id}
                      onClick={() => {
                        onSelect(thread.id);
                        setOpen(false);
                      }}
                      className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
                        isActive
                          ? "bg-indigo/10 text-text-primary"
                          : "text-text-secondary hover:text-text-primary hover:bg-canvas-muted/30"
                      }`}
                    >
                      <MessageSquare size={12} className="shrink-0 opacity-50" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{thread.title}</p>
                        <p className="text-[10px] text-text-tertiary">{timeStr}</p>
                      </div>
                    </button>
                  );
                })}
            </div>
          )}

          {threads.length === 0 && (
            <p className="px-4 py-3 text-xs text-text-tertiary text-center">
              No past conversations
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AskView() {
  const [threads, setThreads] = useState<Thread[]>(() => loadThreads());
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const persistThread = useCallback((threadId: string, msgs: Message[]) => {
    setThreads((prev) => {
      const serialized = serializeMessages(msgs);
      const existing = prev.find((t) => t.id === threadId);
      let updated: Thread[];
      if (existing) {
        updated = prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                messages: serialized,
                title: threadTitle(serialized),
                updatedAt: new Date().toISOString(),
              }
            : t
        );
      } else {
        const now = new Date().toISOString();
        updated = [
          ...prev,
          {
            id: threadId,
            title: threadTitle(serialized),
            messages: serialized,
            createdAt: now,
            updatedAt: now,
          },
        ];
      }
      saveThreads(updated);
      return updated;
    });
  }, []);

  const handleSend = (text?: string) => {
    const content = text || input.trim();
    if (!content) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date(),
    };

    // If no active thread, create one
    const threadId = activeThreadId || `thread-${Date.now()}`;
    if (!activeThreadId) setActiveThreadId(threadId);

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setIsTyping(true);

    persistThread(threadId, nextMessages);

    // Simulate AI response delay
    setTimeout(
      () => {
        const aiMsg: Message = {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: getMockResponse(content),
          timestamp: new Date(),
        };
        setMessages((prev) => {
          const withAi = [...prev, aiMsg];
          persistThread(threadId, withAi);
          return withAi;
        });
        setIsTyping(false);
      },
      1200 + Math.random() * 800
    );
  };

  const handleSelectThread = (id: string) => {
    const thread = threads.find((t) => t.id === id);
    if (!thread) return;
    setActiveThreadId(id);
    setMessages(deserializeMessages(thread.messages));
    setInput("");
    setIsTyping(false);
  };

  const handleNewConversation = () => {
    setActiveThreadId(null);
    setMessages([]);
    setInput("");
    setIsTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isEmpty = messages.length === 0;

  const threadPicker = (
    <div className="absolute top-4 left-4 z-10">
      <ThreadDropdown
        threads={threads}
        activeThreadId={activeThreadId}
        onSelect={handleSelectThread}
        onNew={handleNewConversation}
      />
    </div>
  );

  const inputBox = (
    <div className="max-w-2xl mx-auto w-full">
      <div className="relative flex items-center rounded-full border border-stroke-subtle bg-canvas-raised/80 backdrop-blur-sm focus-within:border-indigo/40 transition-all duration-normal px-5 py-1">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about your team..."
          rows={1}
          className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-tertiary py-2.5 resize-none outline-none max-h-[80px] min-h-[36px]"
          style={{ height: "36px" }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "36px";
            target.style.height = Math.min(target.scrollHeight, 80) + "px";
          }}
        />
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || isTyping}
          className={`flex items-center justify-center w-7 h-7 rounded-full transition-all duration-normal shrink-0 ml-2 ${
            input.trim()
              ? "bg-indigo text-white hover:bg-indigo/90"
              : "bg-transparent text-text-tertiary"
          } disabled:cursor-not-allowed`}
        >
          <ArrowUp size={14} />
        </button>
      </div>
    </div>
  );

  if (isEmpty) {
    return (
      <div className="relative flex flex-col items-center justify-center h-screen px-8">
        {threadPicker}

        <div className="w-12 h-12 rounded-2xl bg-indigo/10 flex items-center justify-center mb-4">
          <Sparkles size={22} className="text-indigo-light" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">
          What would you like to know?
        </h2>
        <p className="text-sm text-text-secondary mb-6 text-center max-w-md">
          Ask about individual users, compare team members, spot trends, or get a pulse check on
          your org.
        </p>

        {/* Input box — centered */}
        <div className="w-full mb-5 px-4">{inputBox}</div>

        {/* Suggestion chips */}
        <div className="flex items-center gap-2">
          {suggestionChips.map((chip) => (
            <button
              key={chip.label}
              onClick={() => handleSend(chip.prompt)}
              className="px-3.5 py-1.5 rounded-full border border-stroke-subtle bg-canvas-raised/50 text-xs text-text-secondary hover:text-text-primary hover:border-indigo/30 hover:bg-indigo/5 transition-all duration-normal"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-screen">
      {threadPicker}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-8 pt-14">
        <div className="max-w-3xl mx-auto py-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isTyping && (
            <div className="flex items-center gap-2 mb-4">
              <div className="w-5 h-5 rounded-md bg-indigo/20 flex items-center justify-center">
                <Sparkles size={10} className="text-indigo-light" />
              </div>
              <div className="flex items-center gap-1">
                <div
                  className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input pinned to bottom */}
      <div className="flex-shrink-0 px-8 pb-8 pt-4">{inputBox}</div>
    </div>
  );
}
