import { useNavigate } from "react-router-dom";
import { Eye, Plus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessions } from "@/console/src/context/SessionsContext";

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) {
    return "Just now";
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  } else if (diffDays === 1) {
    return "Yesterday";
  } else {
    return `${diffDays} days ago`;
  }
}

export default function SessionsView() {
  const navigate = useNavigate();
  const { sessions } = useSessions();

  return (
    <div className="p-8 space-y-6 app-no-drag">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Your Sessions</h1>
          <p className="text-text-secondary mt-1">
            Work sessions where Mitable observes your screen
          </p>
        </div>
        <Button
          onClick={() => navigate("/sessions/new")}
          className="gap-2 bg-gradient-purple text-white hover:shadow-glow-purple transition-all duration-300"
        >
          <Plus size={20} />
          <span>New Session</span>
        </Button>
      </div>

      {/* Sessions List */}
      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-background-elevated rounded-full flex items-center justify-center mb-4">
            <Eye size={32} className="text-text-tertiary" />
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">
            No sessions yet
          </h3>
          <p className="text-text-secondary max-w-sm">
            Start a new session to let Mitable observe your work and help create
            updates for your teammates.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => navigate(`/sessions/${session.id}`)}
              className={`group bg-background-secondary border ${
                session.isActive
                  ? "border-primary/30 shadow-card-hover"
                  : "border-border-subtle"
              } rounded-lg p-4 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 cursor-pointer`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className={`w-10 h-10 bg-background-elevated rounded-lg flex items-center justify-center flex-shrink-0 ${
                      session.isActive ? "bg-primary/20" : ""
                    }`}
                  >
                    <Eye
                      size={20}
                      className={session.isActive ? "text-primary" : "text-text-tertiary"}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-text-primary text-base font-medium group-hover:text-white transition-colors truncate">
                      {session.name}
                    </h3>
                    <div className="flex items-center gap-2 text-text-tertiary text-sm mt-0.5">
                      <span>
                        {session.selectedWindows.length} window
                        {session.selectedWindows.length !== 1 ? "s" : ""}
                      </span>
                      <span className="text-text-tertiary">•</span>
                      <span>{formatTimestamp(session.createdAt)}</span>
                      {session.isActive && (
                        <>
                          <span className="text-text-tertiary">•</span>
                          <span className="text-primary">Active</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <ChevronRight
                  size={20}
                  className="text-text-tertiary group-hover:text-text-secondary group-hover:translate-x-1 transition-all flex-shrink-0"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

