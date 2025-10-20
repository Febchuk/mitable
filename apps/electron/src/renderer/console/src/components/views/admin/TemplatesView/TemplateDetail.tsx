import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Edit, Calendar, Users, CheckCircle2, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { fetchTemplateDetail, type TemplateDetail as TemplateDetailType } from "@/console/src/services/adminService";

// Icon map for template icons
const iconMap: Record<string, any> = {
  Settings: Edit,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
};

export default function TemplateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<TemplateDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedWeeks, setExpandedWeeks] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!id) {
      setError("No template ID provided");
      setLoading(false);
      return;
    }

    const loadTemplateDetail = async () => {
      try {
        setLoading(true);
        setError(null);
        const templateData = await fetchTemplateDetail(id);
        setTemplate(templateData);
        // Expand all weeks by default
        const expanded: Record<number, boolean> = {};
        templateData.tasksByWeek.forEach((week) => {
          expanded[week.weekNumber] = true;
        });
        setExpandedWeeks(expanded);
      } catch (err) {
        console.error("Failed to load template detail:", err);
        setError(err instanceof Error ? err.message : "Failed to load template details");
      } finally {
        setLoading(false);
      }
    };

    loadTemplateDetail();
  }, [id]);

  const toggleWeek = (weekNumber: number) => {
    setExpandedWeeks((prev) => ({
      ...prev,
      [weekNumber]: !prev[weekNumber],
    }));
  };

  const formatDate = (dateString: Date | string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
            <p className="text-sm text-text-secondary">Loading template details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="p-8">
        <button
          onClick={() => navigate("/templates")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-4"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to Templates</span>
        </button>
        <p className="text-status-error">{error || "Template not found"}</p>
      </div>
    );
  }

  const IconComponent = iconMap[template.icon || "Settings"] || Edit;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <button
          onClick={() => navigate("/templates")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to Templates</span>
        </button>

        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: template.color || "#3b82f6" }}
            >
              <IconComponent size={32} className="text-white" />
            </div>

            {/* Title and metadata */}
            <div className="space-y-2">
              <h1 className="text-4xl font-bold text-text-primary">{template.title}</h1>
              <div className="flex items-center gap-3 flex-wrap">
                {template.roleTags.map((role, index) => (
                  <Badge
                    key={index}
                    className="bg-background-elevated text-text-secondary border-transparent hover:bg-background-elevated"
                  >
                    {role}
                  </Badge>
                ))}
                <span className="text-text-secondary text-sm">
                  {template.totalWeeks} weeks • {template.taskCount} tasks
                </span>
              </div>
              {template.description && (
                <p className="text-text-secondary max-w-2xl">{template.description}</p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="bg-background-elevated border-transparent text-text-primary hover:bg-background-elevated/80"
            >
              Assign to Users
            </Button>
            <Button
              className="bg-primary text-white hover:bg-primary/90 gap-2"
              onClick={() => navigate(`/templates/${template.id}/edit`)}
            >
              <Edit size={16} />
              Edit Template
            </Button>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-3 gap-6">
        {/* Usage Statistics */}
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-text-primary">Usage</h2>
          </div>
          <div className="space-y-2">
            <p className="text-5xl font-bold text-text-primary">{template.usageStats.assignedCount}</p>
            <p className="text-sm text-text-secondary">
              {template.usageStats.assignedCount === 1 ? "user assigned" : "users assigned"}
            </p>
          </div>
        </div>

        {/* Total Tasks */}
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-text-primary">Total Tasks</h2>
          </div>
          <div className="space-y-2">
            <p className="text-5xl font-bold text-text-primary">{template.taskCount}</p>
            <p className="text-sm text-text-secondary">across {template.totalWeeks} weeks</p>
          </div>
        </div>

        {/* Metadata */}
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-text-primary">Created</h2>
          </div>
          <div className="space-y-2">
            <p className="text-2xl font-bold text-text-primary">{formatDate(template.createdAt)}</p>
            <p className="text-sm text-text-secondary">Last updated {formatDate(template.updatedAt)}</p>
          </div>
        </div>
      </div>

      {/* Tasks by Week */}
      <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-1">Tasks</h2>
          <p className="text-sm text-text-secondary">Weekly breakdown of onboarding tasks</p>
        </div>

        <div className="space-y-3">
          {template.tasksByWeek.length === 0 ? (
            <p className="text-center text-text-secondary py-8">No tasks added yet</p>
          ) : (
            template.tasksByWeek.map((week) => (
              <div
                key={week.weekNumber}
                className="bg-background-secondary rounded-lg border border-border-subtle overflow-hidden"
              >
                {/* Week Header */}
                <button
                  onClick={() => toggleWeek(week.weekNumber)}
                  className="w-full flex items-center justify-between p-4 hover:bg-background-tertiary transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-primary font-bold">{week.weekNumber}</span>
                    </div>
                    <div className="text-left">
                      <h3 className="text-text-primary font-semibold">Week {week.weekNumber}</h3>
                      <p className="text-sm text-text-secondary">{week.tasks.length} tasks</p>
                    </div>
                  </div>
                  {expandedWeeks[week.weekNumber] ? (
                    <ChevronUp size={20} className="text-text-secondary" />
                  ) : (
                    <ChevronDown size={20} className="text-text-secondary" />
                  )}
                </button>

                {/* Tasks List */}
                {expandedWeeks[week.weekNumber] && (
                  <div className="border-t border-border-subtle">
                    {week.tasks.map((task, index) => (
                      <div
                        key={task.id}
                        className={`p-4 ${
                          index < week.tasks.length - 1 ? "border-b border-border-subtle" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-background-tertiary flex items-center justify-center flex-shrink-0 mt-1">
                            <span className="text-xs text-text-secondary">{index + 1}</span>
                          </div>
                          <div className="flex-1 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <h4 className="text-text-primary font-medium">{task.title}</h4>
                              {task.timeEstimate && (
                                <Badge className="bg-background-tertiary text-text-secondary border-transparent flex-shrink-0">
                                  <Clock size={12} className="mr-1" />
                                  {task.timeEstimate}
                                </Badge>
                              )}
                            </div>
                            {task.description && (
                              <p className="text-sm text-text-secondary leading-relaxed">
                                {task.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Assigned Users */}
      {template.usageStats.assignedUsers.length > 0 && (
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-text-primary mb-1">Assigned Users</h2>
            <p className="text-sm text-text-secondary">People currently using this template</p>
          </div>

          <div className="space-y-3">
            {template.usageStats.assignedUsers.map((user) => (
              <div
                key={user.id}
                className="bg-background-secondary rounded-lg border border-border-subtle p-4 space-y-2 hover:border-border-subtle/80 transition-colors cursor-pointer"
                onClick={() => navigate(`/people/${user.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-text-primary font-semibold">{user.name}</h3>
                    <p className="text-sm text-text-secondary">{user.role}</p>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      user.progress === 100 ? "text-status-success" : "text-primary"
                    }`}
                  >
                    {user.progress}% complete
                  </span>
                </div>
                <Progress value={user.progress} className="h-2 bg-border-subtle" />
                <p className="text-xs text-text-secondary">
                  Assigned on {formatDate(user.assignedAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
