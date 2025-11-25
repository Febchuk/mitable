import { useState } from "react";
import { useRoadmap, useToggleTask } from "@/console/src/hooks/queries/roadmap";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RoadmapDetailProps {
  roadmapId: string;
}

export default function RoadmapDetail({ roadmapId }: RoadmapDetailProps) {
  const { data: roadmap, isLoading, error } = useRoadmap();
  const toggleTaskMutation = useToggleTask();
  const navigate = useNavigate();
  const [currentWeek, setCurrentWeek] = useState(roadmap?.currentWeek || 1);

  // Extract weeks from roadmap data
  const weeks = roadmap?.weeks || [];

  // Calculate overall progress
  const allTasks = weeks.flatMap((w) => w.tasks);
  const completedTasks = allTasks.filter((t) => t.completed).length;
  const totalTasks = allTasks.length;
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const handleToggleTask = (taskId: string) => {
    // Find current completion status
    let currentCompleted = false;
    for (const week of weeks) {
      const task = week.tasks.find((t) => t.id === taskId);
      if (task) {
        currentCompleted = task.completed;
        break;
      }
    }

    toggleTaskMutation.mutate({
      taskId,
      completed: !currentCompleted,
    });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0810]">
        <div className="w-8 h-8 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0810]">
        <div className="text-center text-status-error">Error loading roadmap</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0810] custom-scrollbar">
      <div className="max-w-5xl mx-auto p-8 space-y-6 app-no-drag">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold text-white">Onboarding Roadmap</h1>
          <p className="text-text-secondary mt-2">Your personalized journey to success</p>
        </div>

        {/* Container for Progress and Weeks */}
        <div className="bg-[#1a1625] rounded-xl border border-primary/20 p-6 space-y-6 shadow-xl">
          {/* Overall Progress */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white text-lg font-semibold">Overall Progress</h2>
              <span className="text-text-secondary text-sm">{overallProgress}% Complete</span>
            </div>
            <Progress value={overallProgress} className="h-2.5 bg-black/40" />
            <div className="mt-2 text-xs text-text-tertiary">
              {completedTasks} of {totalTasks} tasks completed
            </div>
          </div>

          {/* Week Tabs */}
          <Tabs
            value={`week-${currentWeek}`}
            onValueChange={(value) => setCurrentWeek(parseInt(value.replace("week-", "")))}
          >
            <TabsList className="w-full bg-transparent gap-2 h-auto p-0 flex-nowrap">
              {weeks.map((week) => (
                <TabsTrigger
                  key={week.number}
                  value={`week-${week.number}`}
                  className="flex-1 min-w-0 flex flex-col items-center gap-1 px-3 py-3 rounded-xl transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=inactive]:bg-[#0f0d15] data-[state=inactive]:text-text-secondary data-[state=inactive]:hover:bg-[#231d2e]"
                >
                  <span className="font-semibold text-sm whitespace-nowrap">Week {week.number}</span>
                  <span className="text-xs opacity-80 whitespace-nowrap">{week.percentage}%</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Task Lists for each week */}
            {weeks.map((week) => (
              <TabsContent key={week.number} value={`week-${week.number}`} className="space-y-3 mt-6">
                {week.tasks.length > 0 ? (
                  week.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-4 p-5 bg-[#0f0d15] rounded-lg border border-primary/10 hover:border-primary/30 hover:bg-[#1a1625] transition-all group"
                    >
                      {/* Checkbox */}
                      <Checkbox
                        checked={task.completed}
                        onCheckedChange={() => handleToggleTask(task.id)}
                        className="flex-shrink-0"
                      />

                      {/* Task Title - Clickable */}
                      <button
                        onClick={() => navigate(`/roadmap/task/${task.id}`)}
                        className="flex-1 text-left hover:text-purple-400 transition-colors"
                      >
                        <p className={`text-base ${task.completed ? "line-through text-text-tertiary" : "text-white"}`}>
                          {task.title}
                        </p>
                      </button>

                      {/* Duration */}
                      <div className="flex-shrink-0 text-text-secondary text-sm bg-black/30 px-3 py-1 rounded-full">
                        {task.timeEstimate}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <p className="text-text-secondary">No tasks for this week yet</p>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
