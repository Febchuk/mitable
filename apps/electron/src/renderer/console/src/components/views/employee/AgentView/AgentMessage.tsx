import { useState } from "react";
import {
  Loader2,
  Terminal,
  FileText,
  Globe,
  AlertCircle,
  Copy,
  Check,
  Search,
  CalendarDays,
} from "lucide-react";
import { Response } from "../../../../../../components/ui/ai-response";

interface AgentMessageProps {
  role: "user" | "assistant" | "tool" | "error";
  content: string;
  toolName?: string;
  isPlan?: boolean;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const Icon = copied ? Check : Copy;

  return (
    <button
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy message"}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 4,
        borderRadius: 6,
        color: copied ? "var(--mi-accent)" : "var(--text-tertiary)",
        opacity: copied ? 1 : 0,
        transition: "opacity 150ms, color 150ms",
        display: "flex",
        alignItems: "center",
      }}
      className="copy-btn"
    >
      <Icon size={14} />
    </button>
  );
}

export default function AgentMessage({ role, content, toolName, isPlan }: AgentMessageProps) {
  if (role === "tool") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "3px 0",
          fontSize: 11,
          color: "var(--text-tertiary)",
        }}
      >
        <ToolIcon name={toolName} />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {content}
        </span>
      </div>
    );
  }

  if (role === "error") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: "10px 14px",
          margin: "6px 0",
          borderRadius: 10,
          background: "rgba(var(--status-error-rgb), 0.06)",
          fontSize: 13,
          lineHeight: 1.6,
          color: "var(--status-error)",
        }}
      >
        <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 3 }} />
        <span>{content}</span>
      </div>
    );
  }

  const isUser = role === "user";

  if (isPlan && !isUser) {
    return (
      <div className="msg-row" style={{ padding: "14px 0", position: "relative" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--mi-accent)" }}>
            Proposed Plan
          </span>
        </div>
        <div
          style={{
            borderLeft: "2px solid rgba(var(--mi-accent-rgb, 130,192,204), 0.25)",
            paddingLeft: 14,
            fontSize: 15,
            lineHeight: 1.75,
            color: "var(--text-primary)",
            letterSpacing: "-0.01em",
            wordBreak: "break-word",
          }}
        >
          <Response>{content}</Response>
        </div>
        <div style={{ position: "absolute", top: 14, right: 0 }}>
          <CopyButton text={content} />
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 0" }}>
        <div
          style={{
            maxWidth: "85%",
            padding: "10px 16px",
            borderRadius: 18,
            borderBottomRightRadius: 4,
            background: "rgba(var(--ui-rgb), 0.08)",
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--text-primary)",
            wordBreak: "break-word",
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  return (
    <div
      className="msg-row"
      style={{
        padding: "14px 0",
        fontSize: 15,
        lineHeight: 1.75,
        color: "var(--text-primary)",
        letterSpacing: "-0.01em",
        wordBreak: "break-word",
        position: "relative",
      }}
    >
      <Response>{content}</Response>
      <div style={{ position: "absolute", top: 14, right: 0 }}>
        <CopyButton text={content} />
      </div>
    </div>
  );
}

const TOOL_PHRASES: Record<string, string[]> = {
  get_my_activity: [
    "Pulling up your recent sessions...",
    "Scanning your work timeline...",
    "Checking what you've been up to...",
  ],
  get_activity_detail: [
    "Reading the full session transcript...",
    "Diving into the details of that block...",
    "Loading screen captures and audio notes...",
  ],
  search_documents: [
    "Searching through your documents...",
    "Scanning your docs for relevant info...",
    "Digging through your files...",
  ],
  list_documents: [
    "Checking what documents you have...",
    "Loading your document library...",
    "Pulling up your files...",
  ],
};

const THINKING_PHRASES = [
  "Thinking about this...",
  "Working through your question...",
  "Let me figure this out...",
  "Processing...",
];

const COMPOSING_PHRASES = [
  "Putting it all together...",
  "Crafting your answer...",
  "Almost there...",
  "Wrapping things up...",
];

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getProgressLabel(phase: string, tool?: string): string {
  if (phase === "tool_call" && tool && TOOL_PHRASES[tool]) {
    return pickRandom(TOOL_PHRASES[tool]);
  }
  if (phase === "tool_result" && tool && TOOL_PHRASES[tool]) {
    const resultPhrases: Record<string, string> = {
      get_my_activity: "Found your sessions, analyzing...",
      get_activity_detail: "Got the full transcript, reading through it...",
      search_documents: "Found some matches, reviewing...",
      list_documents: "Got your docs, checking relevance...",
    };
    return resultPhrases[tool] || "Processing results...";
  }
  if (phase === "composing") return pickRandom(COMPOSING_PHRASES);
  return pickRandom(THINKING_PHRASES);
}

export function AgentThinking({ phase, tool }: { phase?: string; tool?: string }) {
  const label = getProgressLabel(phase || "thinking", tool);

  return (
    <div style={{ padding: "10px 0" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: "var(--text-tertiary)",
        }}
      >
        <Loader2
          size={13}
          style={{ color: "var(--mi-accent)", animation: "spin 1s linear infinite", flexShrink: 0 }}
        />
        {tool && <ToolIcon name={tool} />}
        <span>{label}</span>
      </div>
    </div>
  );
}

function ToolIcon({ name }: { name?: string }) {
  const style = { color: "var(--text-tertiary)" };
  if (!name) return <Terminal size={12} style={style} />;
  if (name === "get_my_activity") return <CalendarDays size={12} style={style} />;
  if (name === "get_activity_detail") return <FileText size={12} style={style} />;
  if (name === "search_documents") return <Search size={12} style={style} />;
  if (name === "list_documents") return <FileText size={12} style={style} />;
  if (name.includes("web") || name.includes("search") || name.includes("fetch"))
    return <Globe size={12} style={style} />;
  return <Terminal size={12} style={style} />;
}
