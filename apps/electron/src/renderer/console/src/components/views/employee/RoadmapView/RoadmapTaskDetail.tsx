import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useRoadmap, useToggleTask } from "@/console/src/hooks/queries/roadmap";
import { Checkbox } from "@/components/ui/checkbox";

export default function RoadmapTaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { data: roadmap } = useRoadmap();
  const toggleTaskMutation = useToggleTask();

  const weeks = roadmap?.weeks || [];

  // Find the task across all weeks
  const task = weeks.flatMap((week) => week.tasks).find((t) => t.id === taskId);

  if (!task) {
    return (
      <div className="p-8">
        <button
          onClick={() => navigate("/roadmap")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-4"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to Roadmap</span>
        </button>
        <p className="text-text-primary">Task not found</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <button
          onClick={() => navigate("/roadmap")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to Roadmap</span>
        </button>

        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-text-primary">{task.title}</h1>
            <p className="text-text-secondary">
              Week {task.week} • {task.timeEstimate}
            </p>
          </div>

          <Checkbox
            checked={task.completed}
            onCheckedChange={() =>
              toggleTaskMutation.mutate({ taskId: task.id, completed: !task.completed })
            }
            className="mt-2"
          />
        </div>
      </div>

      {/* Task Details */}
      <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">Task Details</h2>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-text-secondary mb-1">Status</p>
            <p className="text-text-primary">{task.completed ? "✓ Completed" : "In Progress"}</p>
          </div>
          <div>
            <p className="text-sm text-text-secondary mb-1">Estimated Time</p>
            <p className="text-text-primary">{task.timeEstimate}</p>
          </div>
          <div>
            <p className="text-sm text-text-secondary mb-1">Week</p>
            <p className="text-text-primary">Week {task.week}</p>
          </div>
        </div>
      </div>

      {/* Resources Section */}
      <div className="bg-background-elevated rounded-lg border border-border-subtle p-6">
        <h2 className="text-xl font-semibold text-text-primary mb-4">Resources</h2>
        {task.sources && task.sources.length > 0 ? (
          <div className="space-y-3">
            {task.sources.map((source) => (
              <div
                key={source.id}
                className="p-4 bg-background-primary rounded-lg border border-border-subtle hover:border-border-hover transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Type badge */}
                  <span className="px-2 py-1 text-xs font-medium bg-accent-secondary/10 text-accent-secondary rounded capitalize shrink-0">
                    {source.type}
                  </span>

                  <div className="flex-1 min-w-0">
                    {/* Title (clickable if URL exists) */}
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-text-primary hover:text-accent-primary transition-colors"
                      >
                        {source.title}
                      </a>
                    ) : (
                      <p className="font-medium text-text-primary">{source.title}</p>
                    )}

                    {/* Description */}
                    {source.description && (
                      <p className="text-sm text-text-secondary mt-1">{source.description}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-text-secondary text-center py-8">No resources available for this task</p>
        )}
      </div>
    </div>
  );
}
