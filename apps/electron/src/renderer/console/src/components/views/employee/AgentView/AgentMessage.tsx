import { Bot, User, Loader2, Terminal, FileText, Globe, AlertCircle } from "lucide-react";

interface AgentMessageProps {
  role: "user" | "assistant" | "tool" | "error";
  content: string;
  toolName?: string;
}

export default function AgentMessage({ role, content, toolName }: AgentMessageProps) {
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

export function AgentThinking() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-muted/30">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/10">
        <Bot className="h-4 w-4 text-violet-500" />
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Thinking...</span>
      </div>
    </div>
  );
}

function ToolIcon({ name }: { name?: string }) {
  if (!name) return <Terminal className="h-3 w-3" />;
  if (name.includes("file") || name.includes("read") || name.includes("write"))
    return <FileText className="h-3 w-3" />;
  if (name.includes("web") || name.includes("search") || name.includes("fetch"))
    return <Globe className="h-3 w-3" />;
  return <Terminal className="h-3 w-3" />;
}
