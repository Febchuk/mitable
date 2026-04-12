/**
 * MonitoringView
 *
 * Main view for session monitoring functionality.
 * Features a hero section for starting sessions and a chronological
 * timeline of past sessions grouped by date.
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSessions } from "@/console/src/hooks/queries/monitoring";
import { useStartSession } from "@/console/src/hooks/useStartSession";
import {
  Search,
  Play,
  Loader2,
  Zap,
  Clock,
  ChevronLeft,
  ChevronRight,
  Activity,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/EmptyState";
import SessionRow from "./SessionRow";
import MonitoringViewSkeleton from "./MonitoringViewSkeleton";
import type { SessionListItem } from "@/console/src/services/monitoringService";

// Group sessions by date category (calendar week based on user locale)
function getFirstDayOfWeek(): number {
  try {
    const locale = new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale);
    const firstDay = (locale as { weekInfo?: { firstDay?: number } }).weekInfo?.firstDay;
    if (typeof firstDay === "number") {
      return firstDay === 7 ? 0 : firstDay; // 7 (Sunday) -> 0
    }
  } catch {
    // Fall through to default
  }
  return 1; // Default to Monday if locale week info is unavailable
}

function getStartOfWeek(date: Date, firstDayOfWeek: number): Date {
  const dayIndex = date.getDay(); // 0 (Sun) -> 6 (Sat)
  const diff = (dayIndex - firstDayOfWeek + 7) % 7;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - diff);
  return start;
}

function groupSessionsByDate(sessions: SessionListItem[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const firstDayOfWeek = getFirstDayOfWeek();
  const weekStart = getStartOfWeek(today, firstDayOfWeek);

  const groups: { label: string; sessions: SessionListItem[] }[] = [
    { label: "Today", sessions: [] },
    { label: "Yesterday", sessions: [] },
    { label: "This Week", sessions: [] },
    { label: "Earlier", sessions: [] },
  ];

  sessions.forEach((session) => {
    const sessionDate = new Date(session.startedAt);
    const sessionDay = new Date(
      sessionDate.getFullYear(),
      sessionDate.getMonth(),
      sessionDate.getDate()
    );

    if (sessionDay.getTime() >= today.getTime()) {
      groups[0].sessions.push(session);
    } else if (sessionDay.getTime() >= yesterday.getTime()) {
      groups[1].sessions.push(session);
    } else if (sessionDay.getTime() >= weekStart.getTime()) {
      groups[2].sessions.push(session);
    } else {
      groups[3].sessions.push(session);
    }
  });

  return groups.filter((g) => g.sessions.length > 0);
}

export default function MonitoringView() {
  const [page, setPage] = useState(1);
  const { data: sessionsData, isLoading, error, isPlaceholderData } = useSessions(page);
  const sessions = sessionsData?.sessions ?? [];
  const pagination = sessionsData?.pagination;
  const totalSessions = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const { startSession, isStarting } = useStartSession();

  // Find active session
  const activeSession = sessions.find((s) => s.status === "active" || s.status === "paused");

  // Filter and sort sessions
  const filteredSessions = useMemo(() => {
    const filtered = sessions.filter(
      (session) =>
        (session.name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
        session.status.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return [...filtered].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }, [sessions, searchQuery]);

  // Group by date
  const groupedSessions = useMemo(() => groupSessionsByDate(filteredSessions), [filteredSessions]);

  if (isLoading) {
    return <MonitoringViewSkeleton />;
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="text-center text-red-400">Error loading sessions</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto app-no-drag">
      {/* ═══════════════════════════════════════════════════════════════════
          HERO SECTION - Start Session CTA
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="px-8 pt-8 pb-6">
        <div className="stagger-1">
          {/* Minimal header */}
          <div className="flex items-end justify-between mb-8">
            <div>
              <h1 className="font-display text-3xl font-semibold text-ink-primary tracking-tight">
                Sessions
              </h1>
              <p className="text-ink-tertiary mt-1 text-sm">
                {totalSessions} total · {activeSession ? "1 active" : "None active"}
              </p>
            </div>

            {/* Search - compact */}
            <div className="relative w-64">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary"
                size={15}
              />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm bg-canvas-muted/50 border-transparent text-ink-primary placeholder:text-ink-tertiary focus:bg-canvas-overlay focus:border-stroke transition-all"
              />
            </div>
          </div>

          {/* Start Session Hero Card */}
          {!activeSession ? (
            <button
              onClick={startSession}
              disabled={isStarting}
              className="group w-full relative overflow-hidden rounded-2xl border border-stroke-subtle bg-gradient-to-br from-canvas-overlay to-canvas-raised p-8 text-left transition-all duration-300 hover:border-indigo/30 hover:shadow-[0_0_40px_-10px_rgba(99,102,241,0.3)]"
            >
              {/* Decorative gradient orb */}
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-5">
                  {/* Icon */}
                  <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo/10 border border-indigo/20 group-hover:bg-indigo/20 group-hover:scale-105 transition-all duration-300">
                    {isStarting ? (
                      <Loader2 size={24} className="text-indigo animate-spin" />
                    ) : (
                      <Zap size={24} className="text-indigo" />
                    )}
                  </div>

                  <div>
                    <h2 className="font-display text-xl font-semibold text-ink-primary tracking-tight">
                      {isStarting ? "Starting session..." : "Start a new session"}
                    </h2>
                    <p className="text-ink-secondary text-sm mt-0.5">
                      Track your work and generate shareable summaries
                    </p>
                  </div>
                </div>

                {/* Arrow indicator */}
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-canvas-muted group-hover:bg-indigo group-hover:text-white transition-all duration-300">
                  <Play size={18} className="ml-0.5" />
                </div>
              </div>
            </button>
          ) : (
            /* Active Session Card - Prominent display */
            <div
              onClick={() => navigate(`/monitoring/${activeSession.id}`)}
              className="group relative overflow-hidden rounded-2xl border-2 border-emerald/30 bg-gradient-to-br from-emerald/5 to-canvas-raised p-6 cursor-pointer transition-all duration-300 hover:border-emerald/50 hover:shadow-[0_0_40px_-10px_rgba(52,211,153,0.3)]"
            >
              {/* Live indicator pulse */}
              <div className="absolute top-6 right-6 flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald"></span>
                </span>
                <span className="text-emerald text-xs font-semibold uppercase tracking-wider">
                  {activeSession.status === "paused" ? "Paused" : "Live"}
                </span>
              </div>

              <div className="flex items-center gap-5">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald/10 border border-emerald/20">
                  <Activity size={24} className="text-emerald" />
                </div>

                <div className="flex-1 min-w-0">
                  <h2 className="font-display text-xl font-semibold text-ink-primary tracking-tight truncate">
                    {activeSession.name || "Current Session"}
                  </h2>
                  <div className="flex items-center gap-4 mt-1 text-sm text-ink-secondary">
                    <span className="flex items-center gap-1.5">
                      <Clock size={14} />
                      {activeSession.duration.formatted}
                    </span>
                    <span>{activeSession.captureCount} captures</span>
                  </div>
                </div>

                <ChevronRight
                  size={20}
                  className="text-ink-tertiary group-hover:text-emerald group-hover:translate-x-1 transition-all"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          SESSION TIMELINE - Chronological list grouped by date
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="px-8 pb-8">
        {groupedSessions.length > 0 ? (
          <div className="space-y-6 stagger-2">
            {groupedSessions.map((group, groupIndex) => (
              <div key={group.label}>
                {/* Date Group Header */}
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                    {group.label}
                  </h3>
                  <div className="flex-1 h-px bg-stroke-subtle" />
                  <span className="text-xs text-ink-tertiary tabular-nums">
                    {group.sessions.length}
                  </span>
                </div>

                {/* Session Rows */}
                <div className="space-y-2">
                  {group.sessions.map((session, sessionIndex) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      onClick={() => navigate(`/monitoring/${session.id}`)}
                      style={{
                        animationDelay: `${groupIndex * 0.05 + sessionIndex * 0.03}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Page Navigation */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 pt-4 pb-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || isPlaceholderData}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-ink-tertiary hover:text-ink-primary hover:bg-canvas-overlay border border-transparent hover:border-stroke-subtle transition-all disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronLeft size={16} />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    // Show: first, last, current ±2
                    if (p === 1 || p === totalPages) return true;
                    if (Math.abs(p - page) <= 2) return true;
                    return false;
                  })
                  .reduce<(number | "ellipsis")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("ellipsis");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "ellipsis" ? (
                      <span key={`e-${idx}`} className="w-8 text-center text-ink-tertiary text-sm">
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => setPage(item)}
                        disabled={isPlaceholderData}
                        className={`flex items-center justify-center w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                          item === page
                            ? "bg-indigo text-white shadow-sm"
                            : "text-ink-secondary hover:text-ink-primary hover:bg-canvas-overlay border border-transparent hover:border-stroke-subtle"
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || isPlaceholderData}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-ink-tertiary hover:text-ink-primary hover:bg-canvas-overlay border border-transparent hover:border-stroke-subtle transition-all disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Empty State */
          <div style={{ padding: "48px 0" }}>
            <EmptyState
              title={searchQuery ? "No matches" : "No sessions yet"}
              description={
                searchQuery
                  ? `Nothing found for "${searchQuery}"`
                  : "Start your first session to begin tracking your work"
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
