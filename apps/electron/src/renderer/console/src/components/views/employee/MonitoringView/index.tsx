/**
 * MonitoringView
 *
 * Main view for session monitoring functionality.
 * Lists past sessions and provides controls to start new sessions.
 * Checks for orphaned active sessions on load (crash recovery).
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSessions, useActiveSession } from "@/console/src/hooks/queries/monitoring";
import { Search, Plus, Camera, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import StartSessionDialog from "./StartSessionDialog";
import SessionCard from "./SessionCard";

export default function MonitoringView() {
  const { data: sessions = [], isLoading, error } = useSessions();
  const { data: activeSession } = useActiveSession();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isStartDialogOpen, setIsStartDialogOpen] = useState(false);
  const [isOrphanedSession, setIsOrphanedSession] = useState(false);
  const [orphanedSessionChecked, setOrphanedSessionChecked] = useState(false);

  // Check for orphaned sessions on mount
  useEffect(() => {
    const checkOrphanedSession = async () => {
      if (activeSession && !orphanedSessionChecked) {
        try {
          // Check if Electron has this session in memory
          const electronState = await window.consoleAPI.getMonitoringSessionState();
          // If database has active session but Electron doesn't, it's orphaned
          if (!electronState || electronState.id !== activeSession.id) {
            setIsOrphanedSession(true);
          }
        } catch (err) {
          // If we can't check Electron state, assume it might be orphaned
          console.warn("[MonitoringView] Could not check Electron session state:", err);
          setIsOrphanedSession(true);
        }
        setOrphanedSessionChecked(true);
      }
    };
    checkOrphanedSession();
  }, [activeSession, orphanedSessionChecked]);

  // Filter sessions based on search query
  const filteredSessions = sessions.filter(
    (session) =>
      (session.name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
      session.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort sessions by start date (most recent first)
  const sortedSessions = [...filteredSessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-center text-text-secondary">Loading sessions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="text-center text-status-error">Error loading sessions</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 app-no-drag">
      {/* Orphaned Session Recovery Banner */}
      {isOrphanedSession && activeSession && (
        <div className="flex items-center gap-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-amber-400">Session Recovery Needed</h3>
            <p className="text-xs text-amber-400/70">
              A session was interrupted unexpectedly. Click to review and end it.
            </p>
          </div>
          <Button
            onClick={() => navigate(`/monitoring/${activeSession.id}`)}
            variant="outline"
            size="sm"
            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
          >
            Review Session
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-text-primary">Work Sessions</h1>
          <p className="text-text-secondary mt-2">
            Monitor your work and share summaries with your team
          </p>
        </div>
        <Button
          onClick={() => setIsStartDialogOpen(true)}
          className="gap-2 bg-primary text-white hover:bg-primary/90"
        >
          <Plus size={20} />
          <span>Start Session</span>
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
          size={20}
        />
        <Input
          placeholder="Search sessions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-12 bg-background-elevated border-transparent text-text-primary placeholder:text-text-secondary"
        />
      </div>

      {/* Sessions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sortedSessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onClick={() => navigate(`/monitoring/${session.id}`)}
          />
        ))}
      </div>

      {/* Empty State */}
      {sortedSessions.length === 0 && (
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <Camera size={32} className="text-primary" />
          </div>
          <h3 className="text-xl font-semibold text-text-primary mb-2">No sessions yet</h3>
          <p className="text-text-secondary mb-6 max-w-md mx-auto">
            {searchQuery
              ? `No sessions found matching "${searchQuery}"`
              : "Start a monitoring session to track your work and generate shareable summaries."}
          </p>
          {!searchQuery && (
            <Button
              onClick={() => setIsStartDialogOpen(true)}
              className="gap-2 bg-primary text-white hover:bg-primary/90"
            >
              <Plus size={20} />
              <span>Start Your First Session</span>
            </Button>
          )}
        </div>
      )}

      {/* Start Session Dialog */}
      <StartSessionDialog open={isStartDialogOpen} onOpenChange={setIsStartDialogOpen} />
    </div>
  );
}
