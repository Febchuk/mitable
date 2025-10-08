import { useState } from "react";
import { useRoadmap } from "../../context/RoadmapContext";
import Card from "../ui/Card";
import ProgressBar from "../ui/ProgressBar";
import Badge from "../ui/Badge";
import { CheckCircle2, Circle, Clock } from "lucide-react";

export default function RoadmapView() {
  const { weeks, toggleTask } = useRoadmap();
  const [selectedWeek, setSelectedWeek] = useState(1);

  const currentWeek = weeks.find((w) => w.number === selectedWeek) || weeks[0];
  const completedTasks = currentWeek?.tasks.filter((t) => t.completed).length || 0;
  const totalTasks = currentWeek?.tasks.length || 0;

  return (
    <div className="p-2xl space-y-xl max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-text-primary mb-sm">
          Your Onboarding Roadmap
        </h1>
        <p className="text-text-secondary">
          Track your progress through your first weeks at the company
        </p>
      </div>

      {/* Week Navigation */}
      <div className="flex gap-md overflow-x-auto pb-sm">
        {weeks.map((week) => {
          const isActive = week.number === selectedWeek;
          const isCompleted = week.percentage === 100;
          const isInProgress = week.percentage > 0 && week.percentage < 100;

          return (
            <button
              key={week.number}
              onClick={() => setSelectedWeek(week.number)}
              className={`flex-shrink-0 px-lg py-md rounded-lg border-2 transition-all ${
                isActive
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background-secondary hover:bg-background-elevated"
              }`}
            >
              <div className="text-left min-w-[120px]">
                <div className="flex items-center gap-sm mb-xs">
                  <span
                    className={`text-sm font-semibold ${
                      isActive ? "text-primary" : "text-text-primary"
                    }`}
                  >
                    Week {week.number}
                  </span>
                  {isCompleted && (
                    <CheckCircle2 size={16} className="text-status-success" />
                  )}
                </div>
                <div className="flex items-center gap-sm">
                  <div className="flex-1 h-1 bg-background-elevated rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        isCompleted
                          ? "bg-status-success"
                          : isInProgress
                            ? "bg-primary"
                            : "bg-text-tertiary"
                      }`}
                      style={{ width: `${week.percentage}%` }}
                    />
                  </div>
                  <span className="text-xs text-text-tertiary">{week.percentage}%</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Week Summary */}
      <Card>
        <div className="flex items-start justify-between mb-lg">
          <div>
            <h2 className="text-2xl font-semibold text-text-primary mb-sm">
              Week {currentWeek?.number}
            </h2>
            <p className="text-sm text-text-secondary">
              {completedTasks} of {totalTasks} tasks completed
            </p>
          </div>
          <Badge
            variant={
              currentWeek?.percentage === 100
                ? "success"
                : currentWeek?.percentage > 0
                  ? "info"
                  : "neutral"
            }
          >
            {currentWeek?.percentage === 100
              ? "Completed"
              : currentWeek?.percentage > 0
                ? "In Progress"
                : "Not Started"}
          </Badge>
        </div>

        <ProgressBar
          percentage={currentWeek?.percentage || 0}
          height="lg"
          showLabel
          className="mb-xl"
        />

        {/* Task List */}
        <div className="space-y-md">
          <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
            Tasks
          </h3>
          <div className="space-y-sm">
            {currentWeek?.tasks.map((task) => (
              <button
                key={task.id}
                onClick={() => toggleTask(task.id)}
                className="w-full flex items-start gap-md p-md bg-background-elevated hover:bg-background-primary rounded-md transition-colors text-left"
              >
                <div className="pt-xs">
                  {task.completed ? (
                    <CheckCircle2 size={20} className="text-status-success" />
                  ) : (
                    <Circle size={20} className="text-text-tertiary" />
                  )}
                </div>
                <div className="flex-1">
                  <p
                    className={`text-sm font-medium mb-xs ${
                      task.completed
                        ? "text-text-secondary line-through"
                        : "text-text-primary"
                    }`}
                  >
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="text-xs text-text-tertiary mb-sm">
                      {task.description}
                    </p>
                  )}
                  <div className="flex items-center gap-sm">
                    <Clock size={14} className="text-text-tertiary" />
                    <span className="text-xs text-text-tertiary">
                      {task.timeEstimate}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
