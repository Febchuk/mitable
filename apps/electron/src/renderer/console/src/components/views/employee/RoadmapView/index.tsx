import { useRoadmap } from "../../../../context/RoadmapContext";
import { Check } from "lucide-react";

export default function RoadmapView() {
  const { weeks, toggleTask } = useRoadmap();

  // Calculate overall progress
  const allTasks = weeks.flatMap((w) => w.tasks);
  const completedTasks = allTasks.filter((t) => t.completed).length;
  const totalTasks = allTasks.length;
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Get Week 1 tasks for display
  const week1 = weeks.find((w) => w.number === 1) || weeks[0];

  return (
    <div className="p-8 space-y-8 app-no-drag">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-white">Onboarding Roadmap</h1>
      </div>

      {/* Overall Progress */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white text-lg">Overall Progress</h2>
          <span className="text-text-tertiary text-sm">{overallProgress}% Complete</span>
        </div>
        <div className="w-full h-2 bg-[#3A3A3A] rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Week Cards */}
      <div className="flex gap-4">
        {weeks.map((week) => {
          const isWeek1 = week.number === 1;
          const hasProgress = week.percentage > 0;

          return (
            <div
              key={week.number}
              className={`flex-shrink-0 px-6 py-4 rounded-xl min-w-[140px] ${
                isWeek1 ? "bg-primary" : hasProgress ? "bg-[#4F46E5]" : "bg-[#374151]"
              }`}
            >
              <div className="text-white font-semibold text-lg mb-1">Week {week.number}</div>
              <div className="text-white/80 text-sm">{week.percentage}% Done</div>
            </div>
          );
        })}
      </div>

      {/* Task List */}
      <div className="space-y-2">
        {week1?.tasks.map((task) => (
          <button
            key={task.id}
            onClick={() => toggleTask(task.id)}
            className={`w-full flex items-center gap-4 p-4 rounded-lg transition-all ${
              task.isActive
                ? "bg-[#2A2A2A] border-2 border-primary"
                : "bg-[#2A2A2A] border-2 border-transparent hover:bg-[#333333]"
            }`}
          >
            {/* Checkbox */}
            <div className="flex-shrink-0">
              {task.completed ? (
                <div className="w-6 h-6 bg-primary rounded flex items-center justify-center">
                  <Check size={16} className="text-white" />
                </div>
              ) : (
                <div className="w-6 h-6 border-2 border-[#8B5CF6] rounded" />
              )}
            </div>

            {/* Task Title */}
            <div className="flex-1 text-left">
              <p className="text-white text-base">{task.title}</p>
            </div>

            {/* Duration */}
            <div className="flex-shrink-0 text-text-tertiary text-sm">{task.timeEstimate}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
