import { useState } from "react";
import { ChevronRight, Clock, TrendingUp, LayoutList, Trash2 } from "lucide-react";
import type { WorkBlock } from "./types";

interface ActivityBlockProps {
  block: WorkBlock;
  blockNumber: number;
  defaultExpanded?: boolean;
  onDelete?: (blockId: string) => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

const BAR_COLOR = "#9B84E8";

/** Expandable task row */
function TaskRow({
  task,
  totalMinutes,
  isLast,
}: {
  task: { shortTitle: string; description: string; minutes: number };
  totalMinutes: number;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round((task.minutes / totalMinutes) * 100);
  const hasDescription = task.description && task.description.trim().length > 0;

  return (
    <div
      style={{
        borderBottom: !isLast ? "0.5px solid rgba(236, 232, 224, 0.04)" : "none",
      }}
    >
      {/* Main row */}
      <div
        onClick={() => hasDescription && setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "7px 0",
          cursor: hasDescription ? "pointer" : "default",
        }}
      >
        <ChevronRight
          size={12}
          style={{
            color: expanded ? "#9B84E8" : "#6B665C",
            flexShrink: 0,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            opacity: hasDescription ? 1 : 0.3,
          }}
        />
        <span
          style={{
            fontSize: 13,
            color: expanded ? "#ECE8E0" : "#9B9689",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {task.shortTitle}
        </span>
        <div style={{ width: 120, flexShrink: 0 }}>
          <div
            style={{
              height: 3,
              background: "rgba(236, 232, 224, 0.06)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: 2,
                width: `${pct}%`,
                background: BAR_COLOR,
              }}
            />
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            color: "#6B665C",
            textAlign: "right",
            width: 36,
            flexShrink: 0,
          }}
        >
          {formatDuration(task.minutes)}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "#6B665C",
            textAlign: "right",
            width: 32,
            flexShrink: 0,
          }}
        >
          {pct}%
        </span>
      </div>

      {/* Expanded description */}
      {expanded && hasDescription && (
        <div
          style={{
            padding: "4px 0 10px 22px",
            fontSize: 12,
            color: "#9B9689",
            lineHeight: 1.5,
          }}
        >
          {task.description}
        </div>
      )}
    </div>
  );
}

export default function ActivityBlock({
  block,
  blockNumber,
  defaultExpanded = false,
  onDelete,
}: ActivityBlockProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const isActive = block.isActive || block.status === "active";
  const timeRange = `${formatTime(block.startTime)} – ${block.endTime ? formatTime(block.endTime) : "now"}`;

  const cardBorder = isActive
    ? "rgba(58, 155, 107, 0.2)"
    : isExpanded
      ? "rgba(155, 132, 232, 0.18)"
      : "rgba(236, 232, 224, 0.08)";

  return (
    <div
      style={{
        background: "#211F1B",
        border: `0.5px solid ${cardBorder}`,
        borderRadius: 10,
        overflow: "hidden",
        marginBottom: 8,
      }}
    >
      {/* Header — always visible */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 16px",
          cursor: "pointer",
        }}
      >
        <ChevronRight
          size={13}
          style={{
            color: isExpanded ? "#9B84E8" : "#6B665C",
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            flexShrink: 0,
          }}
        />

        <span
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            color: isExpanded ? "#9B84E8" : "#6B665C",
            flexShrink: 0,
          }}
        >
          Block {blockNumber}
        </span>

        <span style={{ fontSize: 13, color: "#9B9689", flexShrink: 0 }}>{timeRange}</span>

        <div style={{ flex: 1, minWidth: 0 }} />

        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            color: "#9B9689",
            flexShrink: 0,
          }}
        >
          <Clock size={12} style={{ color: "#6B665C" }} />
          {formatDuration(block.duration)}
        </span>

        {isActive ? (
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              background: "rgba(58, 155, 107, 0.14)",
              color: "#3A9B6B",
              border: "0.5px solid rgba(58, 155, 107, 0.28)",
            }}
          >
            Active
          </span>
        ) : (
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              background: "rgba(236, 232, 224, 0.07)",
              color: "#9B9689",
            }}
          >
            Ready
          </span>
        )}

        {/* Delete */}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(block.id);
            }}
            style={{
              width: 24,
              height: 24,
              borderRadius: 5,
              border: "none",
              background: "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#6B665C",
              opacity: 0.5,
              transition: "opacity 0.15s ease, color 0.15s ease",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "1";
              e.currentTarget.style.color = "#E87474";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "0.5";
              e.currentTarget.style.color = "#6B665C";
            }}
          >
            <Trash2 size={12} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div
          style={{
            borderTop: "0.5px solid rgba(236, 232, 224, 0.06)",
            padding: "0 16px 16px",
          }}
        >
          {/* Tasks section */}
          {block.taskBreakdown && block.taskBreakdown.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 10,
                  color: "#6B665C",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  padding: "14px 0 8px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <TrendingUp size={11} style={{ color: "#6B665C" }} />
                Tasks
              </div>

              {block.taskBreakdown.map((task, idx) => {
                const totalMinutes =
                  block.taskBreakdown.reduce((s, t) => s + t.minutes, 0) || 1;

                return (
                  <TaskRow
                    key={idx}
                    task={task}
                    totalMinutes={totalMinutes}
                    isLast={idx === block.taskBreakdown.length - 1}
                  />
                );
              })}
            </>
          )}

          {/* App breakdown section */}
          {block.appBreakdown && block.appBreakdown.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 10,
                  color: "#6B665C",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  padding:
                    block.taskBreakdown && block.taskBreakdown.length > 0
                      ? "18px 0 8px"
                      : "14px 0 8px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <LayoutList size={11} style={{ color: "#6B665C" }} />
                App breakdown
              </div>

              {block.appBreakdown.map((app, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 0",
                    borderBottom:
                      idx < block.appBreakdown.length - 1
                        ? "0.5px solid rgba(236, 232, 224, 0.04)"
                        : "none",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: "#9B9689",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {app.app}
                  </span>
                  <div style={{ width: 120, flexShrink: 0 }}>
                    <div
                      style={{
                        height: 3,
                        background: "rgba(236, 232, 224, 0.06)",
                        borderRadius: 2,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: 2,
                          width: `${app.percentage}%`,
                          background: BAR_COLOR,
                        }}
                      />
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: "#6B665C",
                      textAlign: "right",
                      width: 36,
                      flexShrink: 0,
                    }}
                  >
                    {formatDuration(app.minutes)}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "#6B665C",
                      textAlign: "right",
                      width: 32,
                      flexShrink: 0,
                    }}
                  >
                    {app.percentage}%
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
