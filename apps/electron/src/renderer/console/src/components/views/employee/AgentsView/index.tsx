import { useState, useEffect, useCallback, useRef } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import TaskLauncher from "./TaskLauncher";
import TaskCard, { type AgentTask } from "./TaskCard";

// ---- Types -----------------------------------------------------------------

type TaskStatus = AgentTask["status"];

interface AssistantContentItem {
  type: "text" | "tool_use";
  text?: string;
  name?: string;
  input?: unknown;
}

interface AssistantMessage {
  type: "assistant";
  message: { content: AssistantContentItem[] };
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

type AgentMessagePayload =
  | AssistantMessage
  | ResultMessage
  | SystemMessage
  | { type: string; [key: string]: unknown };

// ---- Helpers ---------------------------------------------------------------

function sortByStartedAt(tasks: AgentTask[]): AgentTask[] {
  return [...tasks].sort((a, b) => b.startedAt - a.startedAt);
}

// ---- Empty state -----------------------------------------------------------

function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="bg-[#1a1a1a] border border-white/6 rounded-xl p-8 flex flex-col items-center text-center gap-3">
      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
        <Icon size={18} className="text-zinc-500" />
      </div>
      <div>
        <p className="text-zinc-300 text-sm font-medium">{title}</p>
        <p className="text-zinc-600 text-xs mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

// ---- Section header --------------------------------------------------------

function SectionHeader({
  label,
  count,
  accentClass,
}: {
  label: string;
  count: number;
  accentClass: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-semibold uppercase tracking-widest ${accentClass}`}>
        {label}
      </span>
      {count > 0 && (
        <span className="text-[10px] font-medium text-zinc-600 bg-zinc-800 rounded-full px-1.5 py-0.5">
          {count}
        </span>
      )}
    </div>
  );
}

// ---- Main component --------------------------------------------------------

export default function AgentsView() {
  // Active tasks live in this component; keyed by taskId
  const [activeTasks, setActiveTasks] = useState<Record<string, AgentTask>>({});
  // Messages per task
  const [taskMessages, setTaskMessages] = useState<Record<string, AgentMessagePayload[]>>({});
  // Completed task history (loaded once on mount)
  const [historyTasks, setHistoryTasks] = useState<AgentTask[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Track IDs we have already moved to history to avoid duplicates
  const movedToHistoryRef = useRef<Set<string>>(new Set());

  // ------------------------------------------------------------------
  // Boot: load existing active tasks + history
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const [active, history] = await Promise.all([
          window.consoleAPI.getActiveAgentTasks(),
          window.consoleAPI.getAgentTaskHistory(),
        ]);

        if (cancelled) return;

        const activeMap: Record<string, AgentTask> = {};
        for (const t of active) {
          activeMap[t.taskId] = {
            taskId: t.taskId,
            description: t.description,
            agentType: t.agentType,
            status: t.status as TaskStatus,
            startedAt: t.startedAt,
          };
        }
        setActiveTasks(activeMap);

        // History comes back flat; filter out anything currently active
        const activeIds = new Set(active.map((t) => t.taskId));
        const historyItems: AgentTask[] = history
          .filter((t) => !activeIds.has(t.taskId))
          .map((t) => ({
            taskId: t.taskId,
            description: t.description,
            agentType: t.agentType,
            status: t.status as TaskStatus,
            startedAt: t.startedAt,
            completedAt: t.completedAt,
            costUsd: t.costUsd,
            error: t.error,
          }));

        setHistoryTasks(sortByStartedAt(historyItems));
      } catch {
        // Graceful degradation — show empty states
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------------------------------
  // IPC subscriptions
  // ------------------------------------------------------------------
  useEffect(() => {
    const unsubMessage = window.consoleAPI.onAgentMessage(
      ({ taskId, message }: { taskId: string; message: unknown }) => {
        // Append message to the task's message list
        setTaskMessages((prev) => ({
          ...prev,
          [taskId]: [...(prev[taskId] ?? []), message as AgentMessagePayload],
        }));

        // If the task isn't in activeTasks yet (race condition on launch), add a placeholder
        setActiveTasks((prev) => {
          if (prev[taskId]) return prev;
          return {
            ...prev,
            [taskId]: {
              taskId,
              description: "Running task...",
              agentType: "claude-code",
              status: "running",
              startedAt: Date.now(),
            },
          };
        });

        // Extract cost/duration from result messages to update task meta
        const msg = message as AgentMessagePayload;
        if (msg.type === "result") {
          const result = msg as ResultMessage;
          setActiveTasks((prev) => {
            const existing = prev[taskId];
            if (!existing) return prev;
            return {
              ...prev,
              [taskId]: {
                ...existing,
                costUsd: result.total_cost_usd ?? existing.costUsd,
                durationMs: result.duration_ms ?? existing.durationMs,
              },
            };
          });
        }
      }
    );

    const unsubComplete = window.consoleAPI.onAgentTaskComplete(
      ({
        taskId,
        result,
      }: {
        taskId: string;
        result: { costUsd?: number; durationMs?: number; error?: string };
      }) => {
        if (movedToHistoryRef.current.has(taskId)) return;
        movedToHistoryRef.current.add(taskId);

        setActiveTasks((prev) => {
          const existing = prev[taskId];
          if (!existing) return prev;

          const completedTask: AgentTask = {
            ...existing,
            status: result.error ? "failed" : "completed",
            completedAt: Date.now(),
            costUsd: result.costUsd ?? existing.costUsd,
            durationMs: result.durationMs ?? existing.durationMs,
            error: result.error,
          };

          // Move to history
          setHistoryTasks((hist) => sortByStartedAt([completedTask, ...hist]));

          // Remove from active map
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
      }
    );

    return () => {
      unsubMessage();
      unsubComplete();
    };
  }, []);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------
  const handleTaskLaunched = useCallback((taskId: string) => {
    // We don't know the full task details yet (the IPC message will fill them in),
    // but insert a placeholder so the card appears immediately.
    setActiveTasks((prev) => ({
      ...prev,
      [taskId]: {
        taskId,
        description: "Initializing...",
        agentType: "claude-code",
        status: "running",
        startedAt: Date.now(),
      },
    }));
  }, []);

  const handleCancel = useCallback((taskId: string) => {
    setActiveTasks((prev) => {
      const existing = prev[taskId];
      if (!existing) return prev;
      return {
        ...prev,
        [taskId]: { ...existing, status: "cancelled" },
      };
    });
  }, []);

  // ------------------------------------------------------------------
  // Derived data
  // ------------------------------------------------------------------
  const activeTaskList = sortByStartedAt(Object.values(activeTasks));
  const recentHistory = historyTasks.slice(0, 20);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="p-8 space-y-6 app-no-drag">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Agents</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Launch and monitor autonomous AI agent tasks
        </p>
      </div>

      {/* Task launcher form */}
      <TaskLauncher onTaskLaunched={handleTaskLaunched} />

      {/* Active tasks */}
      <section className="space-y-3">
        <SectionHeader
          label="Active tasks"
          count={activeTaskList.length}
          accentClass="text-blue-400"
        />

        {activeTaskList.length === 0 ? (
          <EmptyState
            icon={Loader2}
            title="No active tasks"
            subtitle="Launch a task above to get started"
          />
        ) : (
          <div className="space-y-2">
            {activeTaskList.map((task) => (
              <TaskCard
                key={task.taskId}
                task={task}
                messages={taskMessages[task.taskId]}
                onCancel={handleCancel}
              />
            ))}
          </div>
        )}
      </section>

      {/* Completed tasks history */}
      <section className="space-y-3">
        <SectionHeader
          label="Recent tasks"
          count={recentHistory.length}
          accentClass="text-zinc-400"
        />

        {historyLoading ? (
          <div className="flex items-center gap-2 text-zinc-600 text-sm py-4">
            <Loader2 size={14} className="animate-spin" />
            Loading history...
          </div>
        ) : recentHistory.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No completed tasks"
            subtitle="Finished tasks will appear here"
          />
        ) : (
          <div className="space-y-2">
            {recentHistory.map((task) => (
              <TaskCard
                key={task.taskId}
                task={task}
                messages={taskMessages[task.taskId]}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
