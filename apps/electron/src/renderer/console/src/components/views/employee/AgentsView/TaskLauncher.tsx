import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Bot, Play, FolderOpen, Loader2 } from "lucide-react";

type AgentType = "claude-code" | "cursor" | "generic-cli";
type PermissionMode = "plan" | "acceptEdits" | "bypassPermissions";

interface TaskLauncherProps {
  onTaskLaunched?: (taskId: string) => void;
}

const AGENT_TYPE_OPTIONS: { value: AgentType; label: string; description: string }[] = [
  {
    value: "claude-code",
    label: "Claude Code",
    description: "Primary AI coding agent",
  },
  {
    value: "cursor",
    label: "Cursor",
    description: "AI-powered code editor agent",
  },
  {
    value: "generic-cli",
    label: "Generic CLI",
    description: "Generic command-line agent",
  },
];

const PERMISSION_MODE_OPTIONS: { value: PermissionMode; label: string; description: string }[] = [
  {
    value: "plan",
    label: "Plan mode",
    description: "Agent plans but does not make changes",
  },
  {
    value: "acceptEdits",
    label: "Accept edits",
    description: "Agent can edit files with approval",
  },
  {
    value: "bypassPermissions",
    label: "Full autonomy",
    description: "Agent operates without confirmation prompts",
  },
];

export default function TaskLauncher({ onTaskLaunched }: TaskLauncherProps) {
  const [taskDescription, setTaskDescription] = useState("");
  const [projectDirectory, setProjectDirectory] = useState("");
  const [agentType, setAgentType] = useState<AgentType>("claude-code");
  const [enableContextTools, setEnableContextTools] = useState(true);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("plan");
  const [costCap, setCostCap] = useState<string>("");
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!taskDescription.trim() || !projectDirectory.trim() || isLaunching) return;

      setIsLaunching(true);
      setLaunchError(null);

      try {
        const params = {
          taskDescription: taskDescription.trim(),
          projectDirectory: projectDirectory.trim(),
          agentType,
          enableContextTools,
          permissionMode,
          ...(costCap !== "" && !isNaN(Number(costCap))
            ? { costCap: Number(costCap) }
            : {}),
        };

        const result = await window.consoleAPI.launchAgentTask(params);

        if (result.error) {
          setLaunchError(result.error);
        } else {
          // Reset form on success
          setTaskDescription("");
          setCostCap("");
          onTaskLaunched?.(result.taskId);
        }
      } catch (err) {
        setLaunchError(err instanceof Error ? err.message : "Failed to launch task");
      } finally {
        setIsLaunching(false);
      }
    },
    [
      taskDescription,
      projectDirectory,
      agentType,
      enableContextTools,
      permissionMode,
      costCap,
      isLaunching,
      onTaskLaunched,
    ]
  );

  const canSubmit = taskDescription.trim().length > 0 && projectDirectory.trim().length > 0 && !isLaunching;

  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-blue-500/15 rounded-lg flex items-center justify-center">
          <Bot size={15} className="text-blue-400" />
        </div>
        <h2 className="text-white text-sm font-semibold tracking-wide">Launch Agent Task</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Task Description */}
        <div className="space-y-1.5">
          <Label htmlFor="task-description" className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
            Task
          </Label>
          <textarea
            id="task-description"
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            placeholder="What do you want the agent to do?"
            rows={3}
            className="w-full bg-[#111111] border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 resize-none outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
          />
        </div>

        {/* Project Directory */}
        <div className="space-y-1.5">
          <Label htmlFor="project-dir" className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
            Project directory
          </Label>
          <div className="relative">
            <FolderOpen
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
            />
            <input
              id="project-dir"
              type="text"
              value={projectDirectory}
              onChange={(e) => setProjectDirectory(e.target.value)}
              placeholder="/path/to/your/project"
              className="w-full bg-[#111111] border border-white/8 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-mono"
            />
          </div>
        </div>

        {/* Two-column row: Agent Type + Permission Mode */}
        <div className="grid grid-cols-2 gap-3">
          {/* Agent Type */}
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
              Agent type
            </Label>
            <div className="space-y-1">
              {AGENT_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAgentType(option.value)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all ${
                    agentType === option.value
                      ? "bg-blue-500/10 border-blue-500/40 text-white"
                      : "bg-[#111111] border-white/8 text-zinc-400 hover:border-white/15 hover:text-zinc-300"
                  }`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      agentType === option.value ? "bg-blue-400" : "bg-zinc-600"
                    }`}
                  />
                  <span className="text-xs font-medium truncate">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Permission Mode */}
          <div className="space-y-1.5">
            <Label className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
              Permission level
            </Label>
            <div className="space-y-1">
              {PERMISSION_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPermissionMode(option.value)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all ${
                    permissionMode === option.value
                      ? "bg-purple-500/10 border-purple-500/40 text-white"
                      : "bg-[#111111] border-white/8 text-zinc-400 hover:border-white/15 hover:text-zinc-300"
                  }`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      permissionMode === option.value ? "bg-purple-400" : "bg-zinc-600"
                    }`}
                  />
                  <span className="text-xs font-medium truncate">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom row: Context Tools Toggle + Cost Cap */}
        <div className="flex items-center gap-4 pt-0.5">
          {/* Context Tools Toggle */}
          <button
            type="button"
            onClick={() => setEnableContextTools((v) => !v)}
            className="flex items-center gap-2.5 group"
            aria-pressed={enableContextTools}
          >
            {/* Custom toggle track */}
            <div
              className={`relative w-8 h-4.5 rounded-full transition-colors ${
                enableContextTools ? "bg-blue-500" : "bg-zinc-700"
              }`}
              style={{ width: "32px", height: "18px" }}
            >
              <div
                className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${
                  enableContextTools ? "translate-x-[14px]" : "translate-x-0.5"
                }`}
                style={{ width: "14px", height: "14px" }}
              />
            </div>
            <span className={`text-xs font-medium transition-colors ${enableContextTools ? "text-zinc-300" : "text-zinc-500"}`}>
              Mitable context tools
            </span>
          </button>

          {/* Cost Cap */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-zinc-500 text-xs">Cost cap $</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={costCap}
              onChange={(e) => setCostCap(e.target.value)}
              placeholder="—"
              className="w-16 bg-[#111111] border border-white/8 rounded-md px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </div>

        {/* Error Display */}
        {launchError && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
            <p className="text-red-400 text-xs">{launchError}</p>
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={!canSubmit}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium h-9 rounded-lg transition-all gap-2"
        >
          {isLaunching ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Launching...
            </>
          ) : (
            <>
              <Play size={14} />
              Launch task
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
