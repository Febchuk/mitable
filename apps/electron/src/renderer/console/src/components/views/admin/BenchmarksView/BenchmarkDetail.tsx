import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useBenchmarkDetail, useTriggerCompute } from "@/console/src/hooks/queries/benchmarks";
import { CategoryBadge } from "../../shared/benchmarks/CategoryBadge";
import { BenchmarkProgressBar } from "../../shared/benchmarks/BenchmarkProgressBar";
import { TrendArrow } from "../../shared/benchmarks/TrendArrow";
import { PercentileBadge } from "../../shared/benchmarks/PercentileBadge";
import { AssignBenchmarkModal } from "./AssignBenchmarkModal";
import { BenchmarkSettingsPanel } from "./BenchmarkSettingsPanel";
import type { BenchmarkAssignment } from "@/console/src/services/benchmarkService";

const SPINNER_COLOR = "#82C0CC";

function getInitial(name: string): string {
  return (name?.charAt(0) || "U").toUpperCase();
}

function ActionButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "8px 16px",
        borderRadius: 8,
        fontSize: 12,
        border: "var(--border-hairline)",
        background: hovered && !disabled ? "rgba(255,255,255,0.04)" : "transparent",
        color: disabled ? "var(--text-tertiary)" : "var(--text-secondary)",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.1s, color 0.1s",
        fontFamily: "var(--font-sans)",
      }}
    >
      {children}
    </button>
  );
}

function AssignmentRow({ assignment, onNameClick }: { assignment: BenchmarkAssignment; onNameClick: (userId: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const [nameHovered, setNameHovered] = useState(false);

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "rgba(255,255,255,0.02)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      {/* Name */}
      <td style={{ padding: "12px 0", verticalAlign: "middle" }}>
        <div
          onClick={(e) => { e.stopPropagation(); onNameClick(assignment.userId); }}
          onMouseEnter={() => setNameHovered(true)}
          onMouseLeave={() => setNameHovered(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "var(--bg-raised)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
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
          <span
            style={{
              fontSize: 13,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 180,
              textDecoration: nameHovered ? "underline" : "none",
            }}
          >
            {assignment.userName}
          </span>
        </div>
      </td>

      {/* Progress */}
      <td style={{ padding: "12px 16px 12px 0", verticalAlign: "middle", width: 140 }}>
        <BenchmarkProgressBar progress={assignment.progress} size="sm" />
      </td>

      {/* Value */}
      <td
        style={{
          padding: "12px 16px 12px 0",
          verticalAlign: "middle",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
          {assignment.currentValue}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: 4 }}>
          / {assignment.targetValue}
        </span>
      </td>

      {/* Percentile */}
      <td style={{ padding: "12px 16px 12px 0", verticalAlign: "middle" }}>
        <PercentileBadge percentile={assignment.percentile} />
      </td>

      {/* Trend */}
      <td style={{ padding: "12px 0", verticalAlign: "middle" }}>
        <TrendArrow trend={assignment.trend} delta={assignment.trendDelta} />
      </td>
    </tr>
  );
}

export function BenchmarkDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: benchmark, isLoading } = useBenchmarkDetail(id ?? "");
  const { mutate: triggerCompute, isPending: isComputing } = useTriggerCompute();

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

      {/* Title + description + badge */}
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
          <CategoryBadge category={benchmark.category} />
        </div>
        {benchmark.description ? (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
            {benchmark.description}
          </p>
        ) : null}
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {[
          {
            label: "Team Average",
            value: `${Math.round(benchmark.teamAverage)}%`,
          },
          {
            label: "Assigned",
            value: benchmark.assignedCount,
          },
          {
            label: "Improving",
            value: benchmark.improvingCount,
          },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              background: "var(--bg-raised)",
              border: "var(--border-hairline)",
              borderRadius: 12,
              padding: "22px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              flex: "1 1 140px",
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.09em",
                fontFamily: "var(--font-sans)",
              }}
            >
              {label}
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
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <ActionButton onClick={() => setAssignModalOpen(true)}>
          Assign People
        </ActionButton>
        <ActionButton
          onClick={() => {
            if (!isComputing && id) triggerCompute(id);
          }}
          disabled={isComputing}
        >
          {isComputing ? "Computing..." : "Recompute"}
        </ActionButton>
        <ActionButton onClick={() => setSettingsOpen(true)}>
          Edit Target
        </ActionButton>
      </div>

      {/* Per-person table */}
      {benchmark.assignments.length > 0 ? (
        <div
          style={{
            background: "var(--bg-raised)",
            border: "var(--border-hairline)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "auto",
            }}
          >
            <thead>
              <tr>
                {["Name", "Progress", "Value", "Percentile", "Trend"].map((col) => (
                  <th
                    key={col}
                    style={{
                      padding: col === "Name" ? "14px 0 10px" : "14px 16px 10px 0",
                      textAlign: "left",
                      fontSize: 10,
                      fontWeight: 500,
                      color: "var(--text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.09em",
                      fontFamily: "var(--font-sans)",
                      borderBottom: "var(--border-hairline)",
                      verticalAlign: "middle",
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {benchmark.assignments.map((assignment) => (
                <AssignmentRow
                  key={assignment.id}
                  assignment={assignment}
                  onNameClick={(userId) => navigate(`/people/${userId}`)}
                />
              ))}
            </tbody>
          </table>
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
          No people assigned yet. Use "Assign People" to get started.
        </div>
      )}

      {/* Modals */}
      <AssignBenchmarkModal
        open={assignModalOpen}
        onOpenChange={setAssignModalOpen}
        benchmarkId={benchmark.id}
        existingUserIds={existingUserIds}
      />
      <BenchmarkSettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        benchmark={benchmark}
      />
    </div>
  );
}
