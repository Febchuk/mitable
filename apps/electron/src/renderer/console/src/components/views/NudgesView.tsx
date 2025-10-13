import { useNudges } from "../../context/NudgesContext";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Avatar from "../ui/Avatar";
import Badge from "../ui/Badge";
import { Check, X, Clock } from "lucide-react";

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${diffDays}d ago`;
  }
}

export default function NudgesView() {
  const { nudges, acceptNudge, dismissNudge } = useNudges();

  const waitingNudges = nudges.filter((n) => n.status === "waiting");
  const resolvedNudges = nudges.filter((n) => n.status === "resolved");

  return (
    <div className="p-2xl space-y-xl max-w-6xl app-no-drag">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-text-primary mb-sm">Expert Nudges</h1>
        <p className="text-text-secondary">
          Connect with colleagues who can help accelerate your onboarding
        </p>
      </div>

      {/* Waiting Nudges */}
      {waitingNudges.length > 0 && (
        <div className="space-y-md">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-text-primary">
              Pending Recommendations
            </h2>
            <Badge variant="info">{waitingNudges.length} waiting</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            {waitingNudges.map((nudge) => (
              <Card key={nudge.id} padding="lg">
                <div className="flex items-start gap-md mb-md">
                  <Avatar
                    name={nudge.expertName}
                    imageUrl={nudge.avatarUrl}
                    size="lg"
                    online={nudge.online}
                  />
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-text-primary">
                      {nudge.expertName}
                    </h3>
                    <p className="text-sm text-text-secondary">{nudge.expertRole}</p>
                  </div>
                  <div className="flex items-center gap-xs text-text-tertiary">
                    <Clock size={14} />
                    <span className="text-xs">{formatTimestamp(nudge.timestamp)}</span>
                  </div>
                </div>

                <p className="text-sm text-text-primary mb-lg">{nudge.description}</p>

                <div className="flex gap-sm">
                  <Button
                    variant="primary"
                    size="sm"
                    fullWidth
                    onClick={() => acceptNudge(nudge.id)}
                  >
                    <Check size={16} className="mr-xs" />
                    Accept
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => dismissNudge(nudge.id)}
                  >
                    <X size={16} />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Resolved Nudges */}
      {resolvedNudges.length > 0 && (
        <div className="space-y-md">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-text-primary">
              Completed Connections
            </h2>
            <Badge variant="success">{resolvedNudges.length} resolved</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            {resolvedNudges.map((nudge) => (
              <Card key={nudge.id} padding="lg" className="opacity-60">
                <div className="flex items-start gap-md mb-md">
                  <Avatar
                    name={nudge.expertName}
                    imageUrl={nudge.avatarUrl}
                    size="lg"
                    online={nudge.online}
                  />
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-text-primary">
                      {nudge.expertName}
                    </h3>
                    <p className="text-sm text-text-secondary">{nudge.expertRole}</p>
                  </div>
                  <Badge variant="success">Completed</Badge>
                </div>

                <p className="text-sm text-text-primary">{nudge.description}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {nudges.length === 0 && (
        <Card padding="lg">
          <div className="text-center py-2xl">
            <div className="w-16 h-16 bg-background-elevated rounded-full flex items-center justify-center mx-auto mb-md">
              <Check size={32} className="text-text-tertiary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-sm">
              All caught up!
            </h3>
            <p className="text-sm text-text-secondary">
              No pending expert recommendations at the moment.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
