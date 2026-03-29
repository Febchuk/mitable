import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Minus, ChevronRight, X } from "lucide-react";
import { useBenchmarkDetail } from "@/console/src/hooks/queries/benchmarks";
import { useUnassignBenchmark } from "@/console/src/hooks/queries/benchmarks";

import { TrendArrow } from "../../shared/benchmarks/TrendArrow";
import { AssignBenchmarkModal } from "./AssignBenchmarkModal";
import type { BenchmarkAssignment } from "@/console/src/services/benchmarkService";

const SPINNER_COLOR = "#82C0CC";

const MINI_RING = 36;
const MINI_STROKE = 3;
const MINI_R = (MINI_RING - MINI_STROKE) / 2;
const MINI_C = 2 * Math.PI * MINI_R;

function MiniScoreRing({ progress }: { progress: number }) {
  const clamped = Math.min(100, Math.max(0, progress));
  const offset = MINI_C - (clamped / 100) * MINI_C;

  let strokeColor: string;
  if (clamped >= 70) {
    const l = 52 - ((clamped - 70) / 30) * 12;
    strokeColor = `hsl(150, 45%, ${l}%)`;
  } else if (clamped >= 40) {
    const l = 62 - ((70 - clamped) / 30) * 10;
    strokeColor = `hsl(28, 55%, ${l}%)`;
  } else {
    const l = 55 - ((40 - clamped) / 40) * 12;
    strokeColor = `hsl(0, 55%, ${l}%)`;
  }

  return (
    <div style={{ position: "relative", width: MINI_RING, height: MINI_RING, flexShrink: 0 }}>
      <svg width={MINI_RING} height={MINI_RING} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={MINI_RING / 2} cy={MINI_RING / 2} r={MINI_R} fill="none" stroke="rgba(var(--ui-rgb), 0.06)" strokeWidth={MINI_STROKE} />
        <circle cx={MINI_RING / 2} cy={MINI_RING / 2} r={MINI_R} fill="none" stroke={strokeColor} strokeWidth={MINI_STROKE} strokeLinecap="round" strokeDasharray={MINI_C} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontWeight: 400, color: "var(--text-primary)", lineHeight: 1 }}>
          {Math.round(clamped)}
        </span>
      </div>
    </div>
  );
}

function getInitial(name: string): string {
  return (name?.charAt(0) || "U").toUpperCase();
}

function IconButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: "var(--border-hairline)",
        background: hovered ? "rgba(255,255,255,0.04)" : "transparent",
        color: "var(--text-secondary)",
        cursor: "pointer",
        transition: "background 0.1s",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

function PersonRow({
  assignment,
  onClick,
  removeMode,
  marked,
  onRemove,
}: {
  assignment: BenchmarkAssignment;
  onClick: () => void;
  removeMode?: boolean;
  marked?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div
      onClick={removeMode ? () => onRemove?.() : onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 0",
        borderBottom: "var(--border-hairline)",
        cursor: "pointer",
        transition: "background 0.15s ease, opacity 0.15s ease",
        opacity: marked ? 0.4 : 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.02)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "rgba(var(--ui-rgb), 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-primary)",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {assignment.userAvatarUrl ? (
          <img
            src={assignment.userAvatarUrl}
            alt={assignment.userName}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          getInitial(assignment.userName)
        )}
      </div>

      {/* Name + role */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-primary)",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {assignment.userName}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            marginTop: 5,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {assignment.userEmail}
        </div>
      </div>

      {/* Score ring */}
      <MiniScoreRing progress={assignment.progress} />

      {/* Trend */}
      <div style={{ flexShrink: 0, minWidth: 60, textAlign: "right" }}>
        <TrendArrow trend={assignment.trend} delta={assignment.trendDelta} />
      </div>

      {removeMode ? (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
          title="Remove"
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: "none",
            background: "rgba(232, 116, 116, 0.1)",
            color: "var(--status-error)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "background 0.1s",
          }}
        >
          <X size={12} />
        </button>
      ) : (
        <ChevronRight size={15} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
      )}
    </div>
  );
}

export function BenchmarkDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: benchmark, isLoading } = useBenchmarkDetail(id ?? "");

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);
  const [markedForRemoval, setMarkedForRemoval] = useState<Set<string>>(new Set());
  const { mutate: unassign } = useUnassignBenchmark();

  const toggleMarked = (userId: string) => {
    setMarkedForRemoval((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleSaveRemovals = () => {
    if (id) {
      for (const userId of markedForRemoval) {
        unassign({ benchmarkId: id, userId });
      }
    }
    setMarkedForRemoval(new Set());
    setRemoveMode(false);
  };

  const handleCancelRemovals = () => {
    setMarkedForRemoval(new Set());
    setRemoveMode(false);
  };

  if (isLoading || !benchmark) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          className="animate-spin"
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: `2px solid ${SPINNER_COLOR}33`,
            borderTopColor: SPINNER_COLOR,
          }}
        />
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Loading benchmark...
        </span>
      </div>
    );
  }

  const existingUserIds = benchmark.assignments.map((a) => a.userId);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflowY: "auto",
        padding: "28px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        boxSizing: "border-box",
      }}
    >
      {/* Back link */}
      <button
        onClick={() => navigate("/benchmarks")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--text-tertiary)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          fontFamily: "var(--font-sans)",
          alignSelf: "flex-start",
          transition: "color 0.1s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--text-secondary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--text-tertiary)";
        }}
      >
        <ArrowLeft size={14} />
        Benchmarks
      </button>

      {/* Title + description + edit button */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 26,
              color: "var(--text-primary)",
              fontWeight: 400,
              letterSpacing: "-0.3px",
              margin: 0,
            }}
          >
            {benchmark.name}
          </h1>

        </div>
        {benchmark.description ? (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
            {benchmark.description}
          </p>
        ) : null}
      </div>

      {/* Inline metrics — Score + Trend */}
      <div style={{ display: "flex", gap: 48, alignItems: "baseline" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              fontFamily: "var(--font-sans)",
            }}
          >
            Score
          </span>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 48,
              fontWeight: 300,
              color: "var(--text-primary)",
              letterSpacing: -2,
              lineHeight: 1,
            }}
          >
            {Math.round(benchmark.teamAverage)}%
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              fontFamily: "var(--font-sans)",
            }}
          >
            Trend
          </span>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 48,
              fontWeight: 300,
              letterSpacing: -2,
              lineHeight: 1,
              color:
                benchmark.trend === "improving"
                  ? "#3A9B6B"
                  : benchmark.trend === "declining"
                    ? "#D4A27A"
                    : "var(--text-primary)",
            }}
          >
            {benchmark.trend === "improving"
              ? `+${benchmark.trendDelta}%`
              : benchmark.trend === "declining"
                ? `-${benchmark.trendDelta}%`
                : "0%"}
          </span>
        </div>
      </div>

      {/* People list */}
      {benchmark.assignments.length > 0 ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span
              style={{
                fontSize: 10,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.09em",
                fontFamily: "var(--font-sans)",
              }}
            >
              People
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {removeMode ? (
                <>
                  <button
                    onClick={handleSaveRemovals}
                    disabled={markedForRemoval.size === 0}
                    style={{
                      height: 32,
                      padding: "0 14px",
                      borderRadius: 8,
                      fontSize: 11,
                      fontFamily: "var(--font-sans)",
                      fontWeight: 500,
                      border: "var(--border-hairline)",
                      cursor: markedForRemoval.size === 0 ? "not-allowed" : "pointer",
                      background: markedForRemoval.size > 0 ? "rgba(232, 116, 116, 0.12)" : "transparent",
                      color: markedForRemoval.size > 0 ? "var(--status-error)" : "var(--text-faint)",
                      transition: "all 0.15s",
                    }}
                  >
                    Remove{markedForRemoval.size > 0 ? ` (${markedForRemoval.size})` : ""}
                  </button>
                  <button
                    onClick={handleCancelRemovals}
                    style={{
                      height: 32,
                      padding: "0 14px",
                      borderRadius: 8,
                      fontSize: 11,
                      fontFamily: "var(--font-sans)",
                      border: "var(--border-hairline)",
                      cursor: "pointer",
                      background: "transparent",
                      color: "var(--text-tertiary)",
                      transition: "color 0.15s",
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <IconButton onClick={() => setAssignModalOpen(true)} title="Add people">
                    <Plus size={14} />
                  </IconButton>
                  <IconButton onClick={() => setRemoveMode(true)} title="Remove people">
                    <Minus size={14} />
                  </IconButton>
                </>
              )}
            </div>
          </div>
          <div style={{ borderTop: "var(--border-hairline)" }}>
            {benchmark.assignments.map((assignment) => (
              <PersonRow
                key={assignment.id}
                assignment={assignment}
                onClick={() => navigate(`/benchmarks/${id}/person/${assignment.userId}`)}
                removeMode={removeMode}
                marked={markedForRemoval.has(assignment.userId)}
                onRemove={() => toggleMarked(assignment.userId)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: "48px 0",
            textAlign: "center",
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          No people assigned yet. Hit + to get started.
        </div>
      )}

      {/* Modals */}
      <AssignBenchmarkModal
        open={assignModalOpen}
        onOpenChange={setAssignModalOpen}
        benchmarkId={benchmark.id}
        existingUserIds={existingUserIds}
      />
    </div>
  );
}
