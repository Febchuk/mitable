import { useRoadmap } from "../../../../context/RoadmapContext";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function RoadmapView() {
  const { weeks, currentWeek, setCurrentWeek, toggleTask } = useRoadmap();
  const navigate = useNavigate();

  // Calculate overall progress
  const allTasks = weeks.flatMap((w) => w.tasks);
  const completedTasks = allTasks.filter((t) => t.completed).length;
  const totalTasks = allTasks.length;
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="p-8 space-y-8 app-no-drag">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-text-primary">Onboarding Roadmap</h1>
      </div>

      {/* Container for Progress and Weeks */}
      <div className="bg-background-secondary rounded-xl border border-border-subtle p-6 space-y-6">
        {/* Overall Progress */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-text-primary text-lg">Overall Progress</h2>
            <span className="text-text-secondary text-sm">{overallProgress}% Complete</span>
          </div>
          <Progress value={overallProgress} className="h-2 bg-background-elevated" />
        </div>

        {/* Week Tabs */}
        <Tabs
          value={`week-${currentWeek}`}
          onValueChange={(value) => setCurrentWeek(parseInt(value.replace("week-", "")))}
        >
          <TabsList className="w-full bg-transparent gap-3 h-auto p-0">
            {weeks.map((week) => (
              <TabsTrigger
                key={week.number}
                value={`week-${week.number}`}
                className="flex-1 flex flex-col items-start gap-1 px-6 py-4 rounded-xl transition-colors data-[state=active]:bg-primary data-[state=active]:text-white data-[state=inactive]:bg-week-inactive data-[state=inactive]:text-text-secondary"
              >
                <span className="font-semibold text-lg">Week {week.number}</span>
                <span className="text-sm opacity-80">{week.percentage}% Done</span>
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
                    className="flex items-center gap-4 p-4 bg-background-elevated rounded-lg hover:bg-background-elevated/80 transition-colors"
                  >
                    {/* Checkbox */}
                    <Checkbox
                      checked={task.completed}
                      onCheckedChange={() => toggleTask(task.id)}
                      className="flex-shrink-0"
                    />

                    {/* Task Title - Clickable */}
                    <button
                      onClick={() => navigate(`/roadmap/task/${task.id}`)}
                      className="flex-1 text-left hover:text-primary transition-colors"
                    >
                      <p className="text-text-primary text-base">{task.title}</p>
                    </button>

                    {/* Duration */}
                    <div className="flex-shrink-0 text-text-secondary text-sm">
                      {task.timeEstimate}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-text-secondary text-center py-8">No tasks for this week yet</p>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
