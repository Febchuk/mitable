/**
 * SessionTimeline
 *
 * Main container for the workstream-based timeline visualization.
 * Manages selection state and combines all timeline layers.
 * Uses backend RLM analysis with automatic fallback to heuristics.
 */

import { useState, useCallback } from "react";
import { Layers, ChevronDown, ChevronUp, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { useSessionWorkstreams } from "./hooks/useSessionWorkstreams";
import type { Workstream } from "./utils/types";
import { WORKSTREAM_COLOR_MAP } from "./utils/types";
import SessionStats from "./SessionStats";
import SwimlanesTimeline from "./SwimlanesTimeline";
import WorkstreamCardsGrid from "./WorkstreamCardsGrid";
import SegmentDetailPanel from "./SegmentDetailPanel";

interface SessionTimelineProps {
  sessionId: string;
  sessionStatus?: string;
  className?: string;
}

export default function SessionTimeline({
  sessionId,
  sessionStatus,
  className = "",
}: SessionTimelineProps) {
  // Fetch workstreams from backend (with auto-RLM analysis)
  const {
    data: transformedData,
    isLoading,
    error,
    isAnalyzing,
    analysisSource,
    triggerAnalysis,
  } = useSessionWorkstreams(sessionId, {
    sessionStatus,
    autoAnalyze: true, // Trigger RLM when heuristic results are detected
  });

  // Check if we're in development mode
  const isDev = import.meta.env.DEV;

  // Selection state
  const [selectedWorkstreamId, setSelectedWorkstreamId] = useState<string | null>(null);

  // Collapsed state
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Handle selection toggle
  const handleWorkstreamSelect = useCallback((workstreamId: string) => {
    setSelectedWorkstreamId((prev) =>
      prev === workstreamId ? null : workstreamId
    );
  }, []);

  // Get selected workstream
  const selectedWorkstream = transformedData?.workstreams.find(
    (w) => w.id === selectedWorkstreamId
  ) || null;

  // Session is active/paused
  const isSessionActive = sessionStatus === "active" || sessionStatus === "paused";

  return (
    <div className={`bg-background-elevated rounded-lg border border-border-subtle ${className}`}>
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsCollapsed(!isCollapsed)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsCollapsed(!isCollapsed);
          }
        }}
        className="w-full flex items-center justify-between p-4 hover:bg-background-tertiary/30 transition-colors rounded-t-lg cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-text-secondary" />
          <h3 className="text-lg font-semibold text-text-primary">Workstream Timeline</h3>
          {transformedData && (
            <span className="text-sm text-text-tertiary">
              ({transformedData.workstreams.length} workstreams)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Dev regenerate button */}
          {isDev && (
            <button
              onClick={(e) => {
                e.stopPropagation(); // Don't trigger collapse
                triggerAnalysis();
              }}
              disabled={isAnalyzing || isLoading}
              className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400 disabled:opacity-50 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-amber-500/10 transition-colors"
              title="Force RLM workstream analysis"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin" : ""}`} />
              Regenerate (Dev)
            </button>
          )}
          <div className="text-text-tertiary">
            {isCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </div>
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="px-4 pb-4 space-y-6">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-text-tertiary animate-spin" />
              <span className="ml-2 text-text-secondary">Loading workstreams...</span>
            </div>
          )}

          {/* Analyzing state (RLM running) */}
          {isAnalyzing && !isLoading && (
            <div className="flex items-center justify-center py-2 px-4 bg-accent-primary/10 rounded-lg border border-accent-primary/20">
              <Sparkles className="w-4 h-4 text-accent-primary animate-pulse" />
              <span className="ml-2 text-sm text-accent-primary">Analyzing workstreams with AI...</span>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="text-center py-8">
              <p className="text-text-secondary">Failed to load workstream data</p>
            </div>
          )}

          {/* Timeline content */}
          {transformedData && transformedData.workstreams.length > 0 && (
            <>
              {/* Layer 1: Session Stats */}
              <SessionStats stats={transformedData.sessionStats} />

              {/* Layer 2: Swimlanes Timeline */}
              <SwimlanesTimeline
                workstreams={transformedData.workstreams}
                sessionStartTime={transformedData.sessionStartTime}
                sessionEndTime={transformedData.sessionEndTime}
                selectedWorkstreamId={selectedWorkstreamId}
                onSegmentClick={handleWorkstreamSelect}
              />

              {/* Layer 3: Workstream Cards */}
              <WorkstreamCardsGrid
                workstreams={transformedData.workstreams}
                selectedWorkstreamId={selectedWorkstreamId}
                onCardClick={handleWorkstreamSelect}
              />

              {/* Layer 4: Detail Panel (when selected) */}
              <SegmentDetailPanel
                workstream={selectedWorkstream}
                isOpen={selectedWorkstreamId !== null}
                onClose={() => setSelectedWorkstreamId(null)}
              />

              {/* Layer 5: Bottom Legend */}
              <WorkstreamLegend
                workstreams={transformedData.workstreams}
                selectedWorkstreamId={selectedWorkstreamId}
                onLegendClick={handleWorkstreamSelect}
              />
            </>
          )}

          {/* Empty state */}
          {transformedData && transformedData.workstreams.length === 0 && !isLoading && (
            <div className="text-center py-8">
              <p className="text-text-secondary">
                {isSessionActive
                  ? "Waiting for activity to be recorded..."
                  : "No workstream activity recorded."}
              </p>
            </div>
          )}

          {/* No data state */}
          {!transformedData && !isLoading && !error && (
            <div className="text-center py-8">
              <p className="text-text-secondary">
                {isSessionActive
                  ? "Recording activity..."
                  : "No activity data available."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Bottom Legend Component
 */
interface WorkstreamLegendProps {
  workstreams: Workstream[];
  selectedWorkstreamId: string | null;
  onLegendClick: (workstreamId: string) => void;
}

function WorkstreamLegend({
  workstreams,
  selectedWorkstreamId,
  onLegendClick,
}: WorkstreamLegendProps) {
  return (
    <div className="flex flex-wrap justify-center gap-4 pt-2">
      {workstreams.map((workstream) => {
        const colorClasses = WORKSTREAM_COLOR_MAP[workstream.color];
        const isDimmed = selectedWorkstreamId !== null && selectedWorkstreamId !== workstream.id;

        return (
          <button
            key={workstream.id}
            onClick={() => onLegendClick(workstream.id)}
            className={`
              flex items-center gap-2 text-sm transition-opacity duration-200
              hover:opacity-100
              ${isDimmed ? "opacity-50" : "opacity-100"}
            `}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${colorClasses.bg}`} />
            <span className="text-text-secondary">{workstream.name}</span>
          </button>
        );
      })}
    </div>
  );
}
