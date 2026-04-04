/* DEPRECATED — Ask RLM admin UI. Not in active use; slated for deletion in app cleanup. */
import { useState, useRef, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowUp,
  Sparkles,
  ChevronDown,
  Plus,
  Trash2,
  FileText,
  Download,
  X,
  Copy,
  Check,
} from "lucide-react";
import {
  sendAskChat,
  fetchAskThreads,
  fetchAskThreadMessages,
  deleteAskThread,
  updateAskMessageReport,
  type AskThread,
  type AskMessageRow,
} from "@/console/src/services/adminService";
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  linkPlugin,
  linkDialogPlugin,
  tablePlugin,
  toolbarPlugin,
  BoldItalicUnderlineToggles,
  ListsToggle,
  CreateLink,
  InsertTable,
  Separator,
  markdownShortcutPlugin,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// ── Types ─────────────────────────────────────────────────────
interface ReportData {
  messageId: string;
  title: string;
  subtitle: string;
  html: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  reportCard?: { title: string; subtitle: string };
  reportHtml?: string;
}

function dbToMessage(row: AskMessageRow): Message {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    timestamp: new Date(row.createdAt),
    reportCard: row.reportTitle
      ? { title: row.reportTitle, subtitle: row.reportSubtitle || "" }
      : undefined,
    reportHtml: row.reportHtml || undefined,
  };
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

// ── PDF Export ────────────────────────────────────────────────
async function exportReportAsPdf(html: string, title: string) {
  try {
    await window.consoleAPI.exportPdf(html, title);
  } catch {
    // Fallback to print dialog if IPC fails
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; font-size: 13px; }
  h1 { font-size: 22px; } h2 { font-size: 18px; margin-top: 28px; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; }
  h3 { font-size: 14px; } table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
  th { font-weight: 600; background: #f5f5f5; } ul, ol { padding-left: 24px; } li { margin-bottom: 4px; } strong { font-weight: 600; }
</style></head><body>${html}</body></html>`);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  }
}

// ── HTML → Markdown converter ─────────────────────────────────
function htmlToMarkdown(html: string): string {
  const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });
  td.use(gfm);
  // Strip inline styles before converting
  const clean = html
    .replace(/\s*style="[^"]*"/gi, "")
    .replace(/\s*style='[^']*'/gi, "")
    .replace(/<\/?font[^>]*>/gi, "")
    .replace(/\s*width="[^"]*"/gi, "")
    .replace(/\s*bgcolor="[^"]*"/gi, "");
  return td.turndown(clean);
}

// ── Report Editor ─────────────────────────────────────────────
function ReportEditor({
  html,
  title,
  messageId,
  onClose,
}: {
  html: string;
  title: string;
  messageId: string;
  onClose: () => void;
}) {
  const editorRef = useRef<MDXEditorMethods>(null);
  const markdown = useMemo(() => {
    // If content was previously saved as markdown (no HTML tags), use directly
    const isHtml = /<[a-z][\s\S]*>/i.test(html);
    return isHtml ? htmlToMarkdown(html) : html;
  }, [html]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentMarkdownRef = useRef(markdown);

  const handleChange = (md: string) => {
    currentMarkdownRef.current = md;

    // Debounce: wait 1.5s after last edit before saving
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus("idle");
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await updateAskMessageReport(messageId, md);
        setSaveStatus("saved");
        // Reset to idle after 2s
        setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2000);
      } catch {
        setSaveStatus("idle");
      }
    }, 1500);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-canvas-default report-editor-wrapper">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-stroke-subtle shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <FileText size={14} className="text-indigo-light" />
            <span className="text-xs font-medium text-text-primary">Report</span>
          </div>
          {/* Save status indicator */}
          <span className="text-[10px] text-text-tertiary">
            {saveStatus === "saving" && "Saving..."}
            {saveStatus === "saved" && "✓ Saved"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportReportAsPdf(mdToHtml(currentMarkdownRef.current), title)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo text-white text-xs font-medium hover:bg-indigo/90 transition-colors"
          >
            <Download size={12} />
            Export PDF
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-canvas-muted/50 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* MDXEditor with built-in toolbar */}
      <div className="flex-1 overflow-y-auto">
        <MDXEditor
          ref={editorRef}
          markdown={markdown}
          onChange={handleChange}
          className="dark-theme dark-editor h-full"
          contentEditableClassName="prose prose-invert prose-sm max-w-none px-8 py-6 min-h-full focus:outline-none"
          plugins={[
            headingsPlugin(),
            listsPlugin(),
            quotePlugin(),
            thematicBreakPlugin(),
            linkPlugin(),
            linkDialogPlugin(),
            tablePlugin(),
            markdownShortcutPlugin(),
            toolbarPlugin({
              toolbarContents: () => (
                <>
                  <BoldItalicUnderlineToggles />
                  <Separator />
                  <ListsToggle />
                  <Separator />
                  <CreateLink />
                  <InsertTable />
                </>
              ),
            }),
          ]}
        />
      </div>
    </div>
  );
}

// ── Lightweight markdown → HTML ───────────────────────────────
function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;

  const closeLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };
  const closeTable = () => {
    if (inTable) {
      out.push("</tbody></table>");
      inTable = false;
    }
  };

  // Escape HTML entities so raw HTML from LLM doesn't render
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Inline formatting: bold, italic, code (applied AFTER escaping)
  const inlineFmt = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(
        /`(.+?)`/g,
        '<code style="background:rgba(255,255,255,0.06);padding:1px 4px;border-radius:3px;font-size:0.85em">$1</code>'
      );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Table rows
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      closeLists();
      const cells = trimmed
        .split("|")
        .filter(Boolean)
        .map((c) => c.trim());
      // Skip separator rows (|---|---|)
      if (cells.every((c) => /^[-:]+$/.test(c))) {
        continue;
      }
      if (!inTable) {
        out.push("<table><thead><tr>");
        cells.forEach((c) => out.push(`<th>${inlineFmt(c)}</th>`));
        out.push("</tr></thead><tbody>");
        inTable = true;
        continue;
      }
      out.push("<tr>");
      cells.forEach((c) => out.push(`<td>${inlineFmt(c)}</td>`));
      out.push("</tr>");
      continue;
    }
    closeTable();

    // Headings
    if (trimmed.startsWith("### ")) {
      closeLists();
      out.push(`<h3>${inlineFmt(trimmed.slice(4))}</h3>`);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      closeLists();
      out.push(`<h2>${inlineFmt(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith("# ")) {
      closeLists();
      out.push(`<h1>${inlineFmt(trimmed.slice(2))}</h1>`);
      continue;
    }

    // Unordered list
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      closeTable();
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${inlineFmt(trimmed.slice(2))}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = trimmed.match(/^(\d+)\.\s(.+)/);
    if (olMatch) {
      closeTable();
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${inlineFmt(olMatch[2])}</li>`);
      continue;
    }

    closeLists();

    // Empty line
    if (trimmed === "") {
      continue;
    }

    // Regular paragraph
    out.push(`<p>${inlineFmt(trimmed)}</p>`);
  }

  closeLists();
  closeTable();
  return out.join("");
}

// ── Components ────────────────────────────────────────────────
function MessageBubble({ message, onOpenReport }: { message: Message; onOpenReport?: () => void }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Silently fail
    }
  };

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
          className={`relative group rounded-xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "bg-indigo text-white rounded-br-sm"
              : "bg-canvas-raised border border-stroke-subtle text-text-primary rounded-bl-sm"
          }`}
        >
          {!isUser && (
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 p-1 rounded-md bg-canvas-overlay/80 border border-stroke-subtle text-text-tertiary hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              title="Copy response"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            </button>
          )}
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <div
              className="prose prose-sm prose-invert max-w-none
                [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-text-primary [&_h1]:mt-3 [&_h1]:mb-1
                [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-text-primary [&_h2]:mt-3 [&_h2]:mb-1
                [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-text-primary [&_h3]:mt-2.5 [&_h3]:mb-1
                [&_p]:my-1 [&_p]:leading-relaxed
                [&_strong]:text-text-primary [&_strong]:font-semibold
                [&_em]:italic
                [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc
                [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal
                [&_li]:my-0.5 [&_li]:leading-relaxed
                [&_table]:text-xs [&_table]:w-full [&_table]:my-2 [&_table]:border-collapse
                [&_th]:text-left [&_th]:py-1.5 [&_th]:px-2 [&_th]:font-semibold [&_th]:text-text-secondary [&_th]:border-b [&_th]:border-stroke-subtle
                [&_td]:py-1.5 [&_td]:px-2 [&_td]:border-b [&_td]:border-stroke-subtle/50
                [&_code]:text-indigo-light"
              dangerouslySetInnerHTML={{ __html: mdToHtml(message.content) }}
            />
          )}
        </div>

        {message.reportCard && (
          <button
            onClick={onOpenReport}
            className="mt-2 flex items-center gap-3 w-full rounded-lg border border-indigo/20 bg-indigo/5 px-4 py-3 text-left hover:bg-indigo/10 hover:border-indigo/30 transition-all group"
          >
            <div className="w-9 h-9 rounded-lg bg-indigo/20 flex items-center justify-center shrink-0">
              <FileText size={16} className="text-indigo-light" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {message.reportCard.title}
              </p>
              <p className="text-[11px] text-text-tertiary">
                {message.reportCard.subtitle} — Click to open
              </p>
            </div>
          </button>
        )}

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
  onDelete,
}: {
  threads: AskThread[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
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
                    <div
                      key={thread.id}
                      className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors group ${
                        isActive
                          ? "bg-indigo/10 text-text-primary"
                          : "text-text-secondary hover:text-text-primary hover:bg-canvas-muted/30"
                      }`}
                    >
                      <button
                        onClick={() => {
                          onSelect(thread.id);
                          setOpen(false);
                        }}
                        className="flex-1 min-w-0 text-left"
                      >
                        <p className="text-sm truncate">{thread.title}</p>
                        <p className="text-[10px] text-text-tertiary">{timeStr}</p>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(thread.id);
                        }}
                        className="shrink-0 opacity-0 group-hover:opacity-100 w-6 h-6 rounded flex items-center justify-center text-text-tertiary hover:text-red-400 hover:bg-red-400/10 transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [threads, setThreads] = useState<AskThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeReport, setActiveReport] = useState<ReportData | null>(null);
  const [activeReportMsgId, setActiveReportMsgId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const requestedThreadId = searchParams.get("threadId");
  const requestedMessageId = searchParams.get("messageId");

  // Load threads from API on mount
  useEffect(() => {
    fetchAskThreads()
      .then(setThreads)
      .catch(() => {});
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const openReport = (msg: Message) => {
    if (msg.reportHtml && msg.reportCard) {
      // Toggle: if same report is already open, close it
      if (editorOpen && activeReportMsgId === msg.id) {
        setEditorOpen(false);
        setActiveReport(null);
        setActiveReportMsgId(null);
        // Scroll to the report message after closing
        setTimeout(() => {
          msgRefs.current[msg.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
        return;
      }
      setActiveReport({
        messageId: msg.id,
        title: msg.reportCard.title,
        subtitle: msg.reportCard.subtitle,
        html: msg.reportHtml,
      });
      setActiveReportMsgId(msg.id);
      setEditorOpen(true);
      // Scroll chat to the report message after layout updates
      setTimeout(() => {
        msgRefs.current[msg.id]?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 100);
    }
  };

  const closeEditor = () => {
    const msgId = activeReportMsgId;
    setEditorOpen(false);
    setActiveReport(null);
    setActiveReportMsgId(null);
    if (msgId) {
      setTimeout(() => {
        msgRefs.current[msgId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  };

  const clearDeepLink = () => {
    if (!requestedThreadId && !requestedMessageId) return;
    const next = new URLSearchParams(searchParams);
    next.delete("threadId");
    next.delete("messageId");
    setSearchParams(next, { replace: true });
  };

  const loadThreadMessages = async (id: string) => {
    setActiveThreadId(id);
    setInput("");
    setIsTyping(false);
    try {
      const rows = await fetchAskThreadMessages(id);
      const nextMessages = rows.map(dbToMessage);
      setMessages(nextMessages);
      return nextMessages;
    } catch {
      setMessages([]);
      return [];
    }
  };

  const refreshThreads = async () => {
    try {
      const updated = await fetchAskThreads();
      setThreads(updated);
    } catch {
      // silently ignore refresh failures
    }
  };

  useEffect(() => {
    if (!requestedThreadId) return;
    if (!threads.some((thread) => thread.id === requestedThreadId)) return;
    if (activeThreadId === requestedThreadId && messages.length > 0) return;
    loadThreadMessages(requestedThreadId);
  }, [requestedThreadId, threads, activeThreadId, messages.length]);

  useEffect(() => {
    if (!requestedMessageId || messages.length === 0) return;
    const target = messages.find((msg) => msg.id === requestedMessageId);
    if (!target?.reportHtml || !target.reportCard) return;
    if (editorOpen && activeReportMsgId === target.id) return;

    setActiveReport({
      messageId: target.id,
      title: target.reportCard.title,
      subtitle: target.reportCard.subtitle,
      html: target.reportHtml,
    });
    setActiveReportMsgId(target.id);
    setEditorOpen(true);
    setTimeout(() => {
      msgRefs.current[target.id]?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 100);
  }, [requestedMessageId, messages, editorOpen, activeReportMsgId]);

  const handleSend = async (text?: string) => {
    const content = text || input.trim();
    if (!content || isTyping) return;

    // Optimistic user message
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const response = await sendAskChat(content, activeThreadId || undefined);

      // If this was a new thread, set the thread ID
      if (!activeThreadId) {
        setActiveThreadId(response.threadId);
      }

      const aiMsg: Message = {
        id: response.messageId || `ai-${Date.now()}`,
        role: "assistant",
        content: response.message,
        timestamp: new Date(),
        reportCard: response.report
          ? { title: response.report.title, subtitle: response.report.subtitle }
          : undefined,
        reportHtml: response.report?.html,
      };

      setMessages((prev) => [...prev, aiMsg]);
      refreshThreads();
    } catch {
      const errMsg: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "Sorry, I couldn't process that request. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSelectThread = async (id: string) => {
    clearDeepLink();
    await loadThreadMessages(id);
  };

  const handleNewConversation = () => {
    clearDeepLink();
    setActiveThreadId(null);
    setMessages([]);
    setInput("");
    setIsTyping(false);
  };

  const handleDeleteThread = async (id: string) => {
    try {
      await deleteAskThread(id);
      setThreads((prev) => prev.filter((t) => t.id !== id));
      if (activeThreadId === id) {
        clearDeepLink();
        setActiveThreadId(null);
        setMessages([]);
        setInput("");
      }
    } catch {
      // silently ignore delete failures
    }
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
        onDelete={handleDeleteThread}
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
          className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-tertiary py-2.5 resize-none outline-none max-h-[108px] min-h-[36px]"
          style={{ height: "36px", overflow: "hidden" }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "36px";
            const newHeight = Math.min(target.scrollHeight, 108);
            target.style.height = newHeight + "px";
            target.style.overflow = newHeight >= 108 ? "auto" : "hidden";
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
      <div className="relative flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-8">
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

  const chatPanel = (
    <div className={`relative flex flex-col ${editorOpen ? "h-full" : "min-h-[calc(100vh-80px)]"}`}>
      {!editorOpen && threadPicker}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 pt-14">
        <div className={`${editorOpen ? "max-w-none" : "max-w-3xl"} mx-auto py-4`}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              ref={(el) => {
                msgRefs.current[msg.id] = el;
              }}
            >
              <MessageBubble
                message={msg}
                onOpenReport={msg.reportCard ? () => openReport(msg) : undefined}
              />
            </div>
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
      <div className="flex-shrink-0 px-6 pb-6 pt-3">{inputBox}</div>
    </div>
  );

  // Split-pane layout when report editor is open
  if (editorOpen && activeReport) {
    return (
      <div className="flex h-[calc(100vh-48px)] overflow-hidden">
        {/* Editor — left 60% */}
        <div className="w-[60%] h-full overflow-hidden">
          <ReportEditor
            html={activeReport.html}
            title={activeReport.title}
            messageId={activeReport.messageId}
            onClose={closeEditor}
          />
        </div>
        {/* Chat — right 40% */}
        <div className="w-[40%] h-full border-l border-stroke-subtle bg-canvas-default/50 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-stroke-subtle shrink-0">
            <p className="text-xs font-medium text-text-secondary">AI Assistant</p>
            <p className="text-[10px] text-text-tertiary">Ask me to refine the report</p>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">{chatPanel}</div>
        </div>
      </div>
    );
  }

  return chatPanel;
}
