import {
  Bot,
  User,
  Loader2,
  Terminal,
  FileText,
  Globe,
  AlertCircle,
  ClipboardList,
} from "lucide-react";

interface AgentMessageProps {
  role: "user" | "assistant" | "tool" | "error";
  content: string;
  toolName?: string;
  isPlan?: boolean;
}

export default function AgentMessage({ role, content, toolName, isPlan }: AgentMessageProps) {
  if (role === "tool") {
    return (
      <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground">
        <ToolIcon name={toolName} />
        <span className="truncate">{content}</span>
      </div>
    );
  }

  if (role === "error") {
    return (
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-4 w-4 text-destructive" />
        </div>
        <div className="text-sm text-destructive">{content}</div>
      </div>
    );
  }

  const isUser = role === "user";

  if (isPlan && !isUser) {
    return (
      <div className="flex items-start gap-3 px-4 py-3 bg-muted/30">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/10">
          <Bot className="h-4 w-4 text-violet-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-xs font-medium text-violet-500">Proposed Plan</span>
          </div>
          <div className="border-l-2 border-violet-400 pl-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-3 px-4 py-3 ${isUser ? "" : "bg-muted/30"}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-primary/10" : "bg-violet-500/10"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary" />
        ) : (
          <Bot className="h-4 w-4 text-violet-500" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-sm leading-relaxed whitespace-pre-wrap break-words">
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
  // Show command/file/query snippet for extra context (e.g. "Running command... find ~ -name *.pdf")
  const detail = toolDetail
    ? toolDetail.length > 50
      ? toolDetail.slice(0, 50) + "..."
      : toolDetail
    : null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-muted/30">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/10">
        <Bot className="h-4 w-4 text-violet-500" />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <span>{label}</span>
        </div>
        {detail && (
          <span className="ml-[22px] truncate text-xs text-muted-foreground/60 font-mono">
            {detail}
          </span>
        )}
      </div>
    </div>
  );
}

function ToolIcon({ name }: { name?: string }) {
  if (!name) return <Terminal className="h-3 w-3" />;
  const lower = name.toLowerCase();
  if (
    lower.includes("file") ||
    lower.includes("read") ||
    lower.includes("write") ||
    lower.includes("edit") ||
    lower === "glob"
  )
    return <FileText className="h-3 w-3" />;
  if (
    lower.includes("web") ||
    lower.includes("search") ||
    lower.includes("fetch") ||
    lower === "grep"
  )
    return <Globe className="h-3 w-3" />;
  return <Terminal className="h-3 w-3" />;
}
