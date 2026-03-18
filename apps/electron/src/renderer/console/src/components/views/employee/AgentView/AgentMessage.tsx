import {
  Loader2,
  Terminal,
  FileText,
  Globe,
  AlertCircle,
  ClipboardList,
  User,
} from "lucide-react";
import MitableIcon from "../../../icons/MitableIcon";

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
          padding: "4px 0",
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
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0" }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "rgba(232, 116, 116, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <AlertCircle size={14} style={{ color: "#E87474" }} />
        </div>
        <div style={{ fontSize: 13, color: "#E87474", lineHeight: 1.6, paddingTop: 4 }}>
          {content}
        </div>
      </div>
    );
  }

  const isUser = role === "user";

  if (isPlan && !isUser) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "12px 0",
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "rgba(155, 132, 232, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <MitableIcon size={14} style={{ color: "#9B84E8" }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 8,
            }}
          >
            <ClipboardList size={13} style={{ color: "#9B84E8" }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: "#9B84E8" }}>Proposed Plan</span>
          </div>
          <div
            style={{
              borderLeft: "2px solid rgba(155, 132, 232, 0.3)",
              paddingLeft: 12,
              fontSize: 13,
              lineHeight: 1.7,
              color: "#ECE8E0",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 0",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: isUser ? "rgba(236, 232, 224, 0.06)" : "rgba(155, 132, 232, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {isUser ? (
          <User size={14} style={{ color: "#9B9689" }} />
        ) : (
          <MitableIcon size={14} style={{ color: "#9B84E8" }} />
        )}
      </div>
      <div
        style={{
          minWidth: 0,
          flex: 1,
          fontSize: 13,
          lineHeight: 1.7,
          color: "#ECE8E0",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          paddingTop: 4,
        }}
      >
        {content}
      </div>
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
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0" }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "rgba(155, 132, 232, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <MitableIcon size={14} style={{ color: "#9B84E8" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, paddingTop: 4 }}>
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
            style={{ color: "#9B84E8", animation: "spin 1s linear infinite", flexShrink: 0 }}
          />
          {icon && <span>{icon}</span>}
          <span>{label}</span>
        </div>
        {detail && (
          <span
            style={{
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
