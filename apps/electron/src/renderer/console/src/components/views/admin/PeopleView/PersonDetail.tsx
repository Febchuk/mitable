import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { fetchUserDetail, type UserDetail } from "@/console/src/services/adminService";

const chartConfig = {
  hours: {
    label: "Hours",
    color: "#6366F1",
  },
};

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [person, setPerson] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("No user ID provided");
      setLoading(false);
      return;
    }

    const loadUserDetail = async () => {
      try {
        setLoading(true);
        setError(null);
        const userData = await fetchUserDetail(id);
        setPerson(userData);
      } catch (err) {
        console.error("Failed to load user detail:", err);
        setError(err instanceof Error ? err.message : "Failed to load user details");
      } finally {
        setLoading(false);
      }
    };

    loadUserDetail();
  }, [id]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
            <p className="text-sm text-text-secondary">Loading user details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="p-8">
        <button
          onClick={() => navigate("/people")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-4"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to People</span>
        </button>
        <p className="text-status-error">{error || "Person not found"}</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <button
          onClick={() => navigate("/people")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to People</span>
        </button>

        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-text-primary">{person.name}</h1>
            <div className="flex items-center gap-3">
              <Badge className="bg-background-elevated text-text-secondary border-transparent hover:bg-background-elevated">
                {person.role}
              </Badge>
              {person.manager && (
                <span className="text-text-secondary">Manager: {person.manager.name}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="bg-background-elevated border-transparent text-text-primary hover:bg-background-elevated/80"
            >
              Send Slack Reminder
            </Button>
            <Button className="bg-primary text-white hover:bg-primary/90">Edit</Button>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 gap-6">
        {/* Onboarding Progress */}
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-text-primary">Onboarding Progress</h2>
            <button className="text-sm text-primary hover:underline">View Details</button>
          </div>
          <div className="space-y-2">
            <p className="text-5xl font-bold text-text-primary">{person.progress}%</p>
            <p className="text-sm text-text-secondary">
              {person.metrics.completedTasks} of {person.metrics.totalTasks} tasks completed
            </p>
          </div>
        </div>

        {/* Overdue Tasks */}
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-text-primary">Overdue Tasks</h2>
            <button className="text-sm text-primary hover:underline">View Details</button>
          </div>
          <div className="space-y-2">
            <p className="text-5xl font-bold text-status-warning">{person.metrics.overdueTasks}</p>
            <p className="text-sm text-text-secondary">
              {person.metrics.overdueTasks} tasks overdue
            </p>
          </div>
        </div>
      </div>

      {/* Assigned Roadmaps */}
      <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-1">Assigned Roadmaps</h2>
          <p className="text-sm text-text-secondary">
            {person.name.split(" ")[0]}'s active onboarding paths
          </p>
        </div>

        <div className="space-y-3">
          {person.assignedRoadmaps.length === 0 ? (
            <p className="text-center text-text-secondary py-4">No roadmaps assigned yet</p>
          ) : (
            person.assignedRoadmaps.map((roadmap) => (
              <div
                key={roadmap.id}
                className="bg-background-secondary rounded-lg border border-border-subtle p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-text-primary font-semibold">{roadmap.title}</h3>
                  <span
                    className={`text-sm font-semibold ${
                      roadmap.completion === 100 ? "text-status-success" : "text-primary"
                    }`}
                  >
                    {roadmap.completion}% complete
                  </span>
                </div>
                <p className="text-sm text-text-secondary">
                  {roadmap.tasks} tasks • {roadmap.description}
                </p>
                <Progress value={roadmap.completion} className="h-2 bg-border-subtle" />
              </div>
            ))
          )}
        </div>
      </div>

      {/* AI Assistant Activity */}
      <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-1">AI Assistant Activity</h2>
          <p className="text-sm text-text-secondary">Recent interactions with the Mitable Agent</p>
        </div>

        <div className="space-y-3">
          {person.conversations.length === 0 ? (
            <p className="text-center text-text-secondary py-4">No conversations yet</p>
          ) : (
            person.conversations.map((conversation) => (
              <div
                key={conversation.id}
                className="flex items-start justify-between p-3 bg-background-secondary rounded-lg border border-border-subtle"
              >
                <div className="flex-1">
                  <p className="text-xs text-text-secondary mb-1">{conversation.timestamp}</p>
                  <p className="text-text-primary">{conversation.question}</p>
                </div>
                <Badge
                  className={
                    conversation.status === "resolved"
                      ? "bg-status-success/20 text-status-success border-transparent"
                      : "bg-status-warning/20 text-status-warning border-transparent"
                  }
                >
                  {conversation.status === "resolved" ? "Resolved by Mitable" : "Required a nudge"}
                </Badge>
              </div>
            ))
          )}
        </div>

        {person.conversations.length > 0 && (
          <button className="text-sm text-primary hover:underline">View All Conversations</button>
        )}
      </div>

      {/* Common Nudge Themes and Platform Activity */}
      <div className="grid grid-cols-2 gap-6">
        {/* Common Nudge Themes */}
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-text-primary mb-1">Common Nudge Themes</h2>
            <p className="text-sm text-text-secondary">
              Topics where {person.name.split(" ")[0]} needed human help
            </p>
          </div>

          <div className="space-y-3">
            {person.nudgeThemes.length === 0 ? (
              <p className="text-center text-text-secondary py-4">No nudges yet</p>
            ) : (
              person.nudgeThemes.map((theme, index) => (
                <div
                  key={index}
                  className="bg-background-secondary rounded-lg border border-border-subtle p-4 space-y-2"
                >
                  <h3 className="text-text-primary font-semibold">{theme.theme}</h3>
                  <p className="text-sm text-text-secondary">{theme.count} times</p>
                  <p className="text-xs text-text-secondary">
                    Nudged:{" "}
                    {theme.nudges.map((nudgedPerson, i) => (
                      <span key={i}>
                        {nudgedPerson.name} ({nudgedPerson.count}x)
                        {i < theme.nudges.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </p>
                </div>
              ))
            )}
          </div>

          {person.nudgeThemes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-text-secondary italic">Auto generated by AI</p>
              <button className="text-sm text-primary hover:underline">View All Nudges</button>
            </div>
          )}
        </div>

        {/* Platform Activity */}
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-text-primary mb-1">Platform Activity</h2>
            <p className="text-sm text-text-secondary">Daily activity hours recorded</p>
          </div>

          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <BarChart data={person.activityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#4A4A4A" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#A1A1A1"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#A1A1A1"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}h`}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="hours" fill="#6366F1" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  );
}
