import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  Clock,
  DollarSign,
  Terminal,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

// ---- Types ----------------------------------------------------------------

type TaskStatus = "running" | "completed" | "failed" | "error" | "cancelled";

interface AssistantContentItem {
  type: "text" | "tool_use";
  text?: string;
  name?: string;
  input?: unknown;
}

interface AssistantMessage {
  type: "assistant";
  message: {
    content: AssistantContentItem[];
  };
}

interface ResultMessage {
  type: "result";
  total_cost_usd?: number;
  duration_ms?: number;
  result?: string;
}

interface SystemMessage {
  type: "system";
  subtype?: string;
}

type AgentMessage = AssistantMessage | ResultMessage | SystemMessage | { type: string; [key: string]: unknown };

interface ParsedOutputEntry {
  id: string;
  kind: "text" | "tool" | "result" | "system";
  content: string;
  toolName?: string;
  toolInput?: unknown;
}

export interface AgentTask {
  taskId: string;
  description: string;
  agentType: string;
  status: TaskStatus;
  startedAt: number;
  completedAt?: number;
  costUsd?: number;
  durationMs?: number;
  error?: string;
}

interface TaskCardProps {
  task: AgentTask;
  messages?: AgentMessage[];
  onCancel?: (taskId: string) => void;
}

// ---- Helpers ---------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

function formatElapsed(startedAt: number): string {
  return formatDuration(Date.now() - startedAt);
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `<$0.01`;
  return `$${usd.toFixed(3)}`;
}

function agentTypeLabel(agentType: string): string {
  switch (agentType) {
    case "claude-code":
      return "Claude Code";
    case "cursor":
      return "Cursor";
    case "generic-cli":
      return "Generic CLI";
    default:
      return agentType;
  }
}

function parseMessages(messages: AgentMessage[]): ParsedOutputEntry[] {
  const entries: ParsedOutputEntry[] = [];

  for (const msg of messages) {
    if (msg.type === "assistant") {
      const assistantMsg = msg as AssistantMessage;
      const content = assistantMsg.message?.content ?? [];
      for (const item of content) {
        if (item.type === "text" && item.text) {
          entries.push({
            id: `${entries.length}-text`,
            kind: "text",
            content: item.text,
          });
        } else if (item.type === "tool_use") {
          entries.push({
            id: `${entries.length}-tool`,
            kind: "tool",
            content: item.name ?? "unknown_tool",
            toolName: item.name,
            toolInput: item.input,
          });
        }
      }
    } else if (msg.type === "result") {
      const resultMsg = msg as ResultMessage;
      if (resultMsg.result) {
        entries.push({
          id: `${entries.length}-result`,
          kind: "result",
          content: resultMsg.result,
        });
      }
    } else if (msg.type === "system") {
      const systemMsg = msg as SystemMessage;
      if (systemMsg.subtype) {
        entries.push({
          id: `${entries.length}-system`,
          kind: "system",
          content: systemMsg.subtype,
        });
      }
    }
  }

  return entries;
}

// ---- Status badge ----------------------------------------------------------

function StatusBadge({ status }: { status: TaskStatus }) {
  const config: Record<TaskStatus, { label: string; className: string; icon: React.ReactNode }> = {
    running: {
      label: "Running",
      className: "bg-blue-500/15 text-blue-400 border-blue-500/25",
      icon: <Loader2 size={10} className="animate-spin" />,
    },
    completed: {
      label: "Completed",
      className: "bg-green-500/15 text-green-400 border-green-500/25",
      icon: <CheckCircle2 size={10} />,
    },
    failed: {
      label: "Failed",
      className: "bg-red-500/15 text-red-400 border-red-500/25",
      icon: <AlertCircle size={10} />,
    },
    error: {
      label: "Error",
      className: "bg-red-500/15 text-red-400 border-red-500/25",
      icon: <AlertCircle size={10} />,
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
      icon: <X size={10} />,
    },
  };

  const { label, className, icon } = config[status] ?? config.error;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}

// ---- Tool use block --------------------------------------------------------

function ToolUseBlock({ entry }: { entry: ParsedOutputEntry }) {
  const [expanded, setExpanded] = useState(false);
  const inputStr = entry.toolInput !== undefined ? JSON.stringify(entry.toolInput, null, 2) : null;

  return (
    <div className="rounded-md border border-white/8 overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-800/60 hover:bg-zinc-800 transition-colors text-left"
      >
        <Terminal size={11} className="text-purple-400 flex-shrink-0" />
        <span className="text-purple-300 font-mono font-medium flex-1 truncate">
          {entry.toolName ?? "tool_use"}
        </span>
        {inputStr && (
          expanded
            ? <ChevronUp size={11} className="text-zinc-500 flex-shrink-0" />
            : <ChevronDown size={11} className="text-zinc-500 flex-shrink-0" />
        )}
      </button>
      {expanded && inputStr && (
        <pre className="px-3 py-2 bg-[#0d0d0d] text-zinc-400 font-mono text-[10px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
          {inputStr}
        </pre>
      )}
    </div>
  );
}

// ---- Main component --------------------------------------------------------

export default function TaskCard({ task, messages = [], onCancel }: TaskCardProps) {
  const [outputExpanded, setOutputExpanded] = useState(task.status === "running");
  const [isCancelling, setIsCancelling] = useState(false);
  const [elapsed, setElapsed] = useState(() => formatElapsed(task.startedAt));
  const outputRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  const parsedOutput = parseMessages(messages);

  // Live elapsed timer for running tasks
  useEffect(() => {
    if (task.status !== "running") return;
    const id = setInterval(() => setElapsed(formatElapsed(task.startedAt)), 1000);
    return () => clearInterval(id);
  }, [task.status, task.startedAt]);

  // Auto-scroll output to bottom when new content arrives, unless user scrolled up
  useEffect(() => {
    if (!outputRef.current || !outputExpanded || userScrolledRef.current) return;
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [parsedOutput.length, outputExpanded]);

  const handleOutputScroll = useCallback(() => {
    const el = outputRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
    userScrolledRef.current = !atBottom;
  }, []);

  const handleCancel = useCallback(async () => {
    if (isCancelling || task.status !== "running") return;
    setIsCancelling(true);
    try {
      await window.consoleAPI.cancelAgentTask(task.taskId);
      onCancel?.(task.taskId);
    } finally {
      setIsCancelling(false);
    }
  }, [isCancelling, task.status, task.taskId, onCancel]);

  const durationDisplay =
    task.status === "running"
      ? elapsed
      : task.durationMs !== undefined
      ? formatDuration(task.durationMs)
      : task.completedAt !== undefined
      ? formatDuration(task.completedAt - task.startedAt)
      : null;

  const borderColor =
    task.status === "running"
      ? "border-blue-500/25"
      : task.status === "completed"
      ? "border-green-500/20"
      : task.status === "cancelled"
      ? "border-yellow-500/20"
      : "border-red-500/20";

  return (
    <div className={`bg-[#1a1a1a] border ${borderColor} rounded-xl overflow-hidden`}>
      {/* Card header */}
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Icon */}
        <div className="w-7 h-7 bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot size={14} className="text-zinc-400" />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Description */}
          <p className="text-white text-sm font-medium leading-snug line-clamp-2">
            {task.description}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={task.status} />
            <span className="text-zinc-600 text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/60 border border-white/6 font-mono">
              {agentTypeLabel(task.agentType)}
            </span>

            {/* Duration */}
            {durationDisplay && (
              <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                <Clock size={9} />
                {durationDisplay}
              </span>
            )}

            {/* Cost */}
            {task.costUsd !== undefined && (
              <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                <DollarSign size={9} />
                {formatCost(task.costUsd)}
              </span>
            )}
          </div>

          {/* Error message */}
          {task.error && (
            <div className="flex items-start gap-1.5 mt-1">
              <AlertCircle size={11} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-xs leading-snug">{task.error}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Expand/collapse output toggle */}
          {parsedOutput.length > 0 && (
            <button
              type="button"
              onClick={() => setOutputExpanded((v) => !v)}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/8 text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-label={outputExpanded ? "Collapse output" : "Expand output"}
            >
              {outputExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}

          {/* Cancel button */}
          {task.status === "running" && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={isCancelling}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/35 text-red-400 text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Cancel task"
            >
              {isCancelling ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <X size={11} />
              )}
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Streaming output */}
      {outputExpanded && parsedOutput.length > 0 && (
        <div className="border-t border-white/6">
          <div
            ref={outputRef}
            onScroll={handleOutputScroll}
            className="max-h-72 overflow-y-auto px-4 py-3 space-y-2 bg-[#111111]"
          >
            {parsedOutput.map((entry) => {
              if (entry.kind === "text") {
                return (
                  <pre
                    key={entry.id}
                    className="text-zinc-300 text-xs leading-relaxed font-mono whitespace-pre-wrap break-words"
                  >
                    {entry.content}
                  </pre>
                );
              }

              if (entry.kind === "tool") {
                return <ToolUseBlock key={entry.id} entry={entry} />;
              }

              if (entry.kind === "result") {
                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2 text-xs text-green-300 bg-green-500/8 border border-green-500/15 rounded-md px-3 py-2"
                  >
                    <CheckCircle2 size={11} className="flex-shrink-0 mt-0.5 text-green-400" />
                    <pre className="font-mono whitespace-pre-wrap break-words leading-relaxed">
                      {entry.content}
                    </pre>
                  </div>
                );
              }

              if (entry.kind === "system") {
                return (
                  <p
                    key={entry.id}
                    className="text-zinc-600 text-[10px] font-mono italic"
                  >
                    [{entry.content}]
                  </p>
                );
              }

              return null;
            })}

            {/* Running indicator at bottom of stream */}
            {task.status === "running" && (
              <div className="flex items-center gap-2 text-blue-400 text-[10px] pt-1">
                <Loader2 size={9} className="animate-spin" />
                <span>Agent is working...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
