import { Loader2, Terminal, FileText, Globe, AlertCircle } from "lucide-react";
import { Response } from "../../../../../../components/ui/ai-response";

interface AgentMessageProps {
  role: "user" | "assistant" | "tool" | "error";
  content: string;
  toolName?: string;
  isPlan?: boolean;
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
          color: "#6B665C",
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
          background: "rgba(232, 116, 116, 0.06)",
          fontSize: 13,
          lineHeight: 1.6,
          color: "#E87474",
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
      <div style={{ padding: "14px 0" }}>
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
            borderLeft: "2px solid rgba(var(--mi-accent-rgb, 200,169,96), 0.25)",
            paddingLeft: 14,
            fontSize: 15,
            lineHeight: 1.75,
            color: "#ECE8E0",
            letterSpacing: "-0.01em",
            wordBreak: "break-word",
          }}
        >
          <Response>{content}</Response>
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
            background: "rgba(236, 232, 224, 0.08)",
            fontSize: 14,
            lineHeight: 1.6,
            color: "#ECE8E0",
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
      style={{
        padding: "14px 0",
        fontSize: 15,
        lineHeight: 1.75,
        color: "#ECE8E0",
        letterSpacing: "-0.01em",
        wordBreak: "break-word",
      }}
    >
      <Response>{content}</Response>
    </div>
  );
}

function formatToolLabel(name: string): string {
  const labels: Record<string, string> = {
    Glob: "Searching files...",
    Grep: "Searching code...",
    Read: "Reading file...",
    Write: "Writing file...",
    Edit: "Writing file...",
    Bash: "Running command...",
    WebSearch: "Searching the web...",
    WebFetch: "Fetching page...",
    mcp__mitable__get_my_sessions: "Loading sessions...",
    mcp__mitable__get_daily_summary: "Loading daily summary...",
    mcp__mitable__slack_send_message: "Sending Slack message...",
    mcp__mitable__slack_list_channels: "Loading Slack channels...",
  };
  return labels[name] || "Working...";
}

export function AgentThinking({
  toolName,
  toolDetail,
}: {
  toolName?: string | null;
  toolDetail?: string | null;
}) {
  const label = toolName ? formatToolLabel(toolName) : "Thinking...";
  const icon = toolName ? <ToolIcon name={toolName} /> : null;
  const detail = toolDetail
    ? toolDetail.length > 50
      ? toolDetail.slice(0, 50) + "..."
      : toolDetail
    : null;

  return (
    <div style={{ padding: "10px 0" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: "#6B665C",
        }}
      >
        <Loader2
          size={13}
          style={{ color: "var(--mi-accent)", animation: "spin 1s linear infinite", flexShrink: 0 }}
        />
        {icon && <span>{icon}</span>}
        <span>{label}</span>
      </div>
      {detail && (
        <span
          style={{
            display: "block",
            marginTop: 3,
            marginLeft: 21,
            fontSize: 11,
            color: "rgba(107, 102, 92, 0.6)",
            fontFamily: "var(--font-mono, monospace)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {detail}
        </span>
      )}
    </div>
  );
}

function ToolIcon({ name }: { name?: string }) {
  const style = { color: "#6B665C" };
  if (!name) return <Terminal size={12} style={style} />;
  const lower = name.toLowerCase();
  if (
    lower.includes("file") ||
    lower.includes("read") ||
    lower.includes("write") ||
    lower.includes("edit") ||
    lower === "glob"
  )
    return <FileText size={12} style={style} />;
  if (
    lower.includes("web") ||
    lower.includes("search") ||
    lower.includes("fetch") ||
    lower === "grep"
  )
    return <Globe size={12} style={style} />;
  return <Terminal size={12} style={style} />;
}
