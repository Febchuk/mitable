import { useUser } from "../../context/UserContext";
import { useRoadmap } from "../../context/RoadmapContext";
import { useNavigate } from "react-router-dom";
import Card from "../ui/Card";
import Button from "../ui/Button";
import ProgressBar from "../ui/ProgressBar";
import { Map, Bell, MessageSquare, CheckCircle2 } from "lucide-react";

export default function HomeView() {
  const { user } = useUser();
  const { weeks } = useRoadmap();
  const navigate = useNavigate();

  const currentWeek = weeks.find((w) => w.number === 1) || weeks[0];
  const completedTasks = currentWeek?.tasks.filter((t) => t.completed).length || 0;
  const totalTasks = currentWeek?.tasks.length || 0;

  return (
    <div className="p-2xl space-y-2xl max-w-6xl">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold text-text-primary mb-sm">
          Welcome back, {user.firstName}!
        </h1>
        <p className="text-text-secondary">
          You're making great progress on your onboarding journey.
        </p>
      </div>

      {/* Current Week Summary */}
      <Card>
        <div className="flex items-start justify-between mb-lg">
          <div>
            <h2 className="text-xl font-semibold text-text-primary mb-xs">
              Week {currentWeek?.number} Progress
            </h2>
            <p className="text-sm text-text-secondary">
              {completedTasks} of {totalTasks} tasks completed
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate("/roadmap")}>
            View Full Roadmap
          </Button>
        </div>

        <ProgressBar
          percentage={currentWeek?.percentage || 0}
          height="lg"
          showLabel
          className="mb-lg"
        />

        {/* Today's Tasks */}
        <div className="space-y-md">
          <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
            This Week's Tasks
          </h3>
          <div className="space-y-sm">
            {currentWeek?.tasks.slice(0, 5).map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-md p-md bg-background-elevated rounded-md"
              >
                <CheckCircle2
                  size={20}
                  className={
                    task.completed ? "text-status-success" : "text-text-tertiary"
                  }
                />
                <div className="flex-1">
                  <p
                    className={`text-sm ${
                      task.completed
                        ? "text-text-secondary line-through"
                        : "text-text-primary"
                    }`}
                  >
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="text-xs text-text-tertiary mt-xs">
                      {task.description}
                    </p>
                  )}
                </div>
                <span className="text-xs text-text-tertiary">{task.timeEstimate}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-md">
        <Card
          hover
          onClick={() => navigate("/roadmap")}
          className="flex flex-col items-center justify-center py-xl cursor-pointer"
        >
          <Map size={32} className="text-primary mb-md" />
          <h3 className="text-sm font-medium text-text-primary">Roadmap</h3>
          <p className="text-xs text-text-secondary mt-xs text-center">
            View your learning path
          </p>
        </Card>

        <Card
          hover
          onClick={() => navigate("/nudges")}
          className="flex flex-col items-center justify-center py-xl cursor-pointer"
        >
          <Bell size={32} className="text-primary mb-md" />
          <h3 className="text-sm font-medium text-text-primary">Nudges</h3>
          <p className="text-xs text-text-secondary mt-xs text-center">
            Connect with experts
          </p>
        </Card>

        <Card
          hover
          onClick={() => navigate("/chats")}
          className="flex flex-col items-center justify-center py-xl cursor-pointer"
        >
          <MessageSquare size={32} className="text-primary mb-md" />
          <h3 className="text-sm font-medium text-text-primary">Chats</h3>
          <p className="text-xs text-text-secondary mt-xs text-center">
            Your conversations
          </p>
        </Card>
      </div>
    </div>
  );
}
