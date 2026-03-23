import { useState, useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { ChevronRight, Clock, TrendingUp, LayoutList, Trash2, Users, User } from "lucide-react";
import type { WorkBlock } from "./types";
import { GranolaIcon } from "../../../../../../components/icons/integrations/GranolaIcon";

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

const BAR_COLOR = "var(--mi-accent)";
const GRANOLA_GREEN = "#C8E64A";
const GRANOLA_BORDER = "rgba(200, 230, 74, 0.18)";
const FIREFLIES_PINK = "#E84393";
const FIREFLIES_BORDER = "rgba(232, 67, 147, 0.18)";

function isMeetingBlock(source?: string): boolean {
  return source === "granola" || source === "fireflies";
}

/** Fireflies.ai logo -- official geometric mark (pink->purple->blue gradient) */
function FirefliesLogo({ size = 24 }: { size?: number }) {
  const s = Math.round(size * 0.62);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: "#1A1A1A",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg viewBox="0 0 56 56" width={s} height={s} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="ff-ab-grad" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E82A73" />
            <stop offset="30%" stopColor="#C5388F" />
            <stop offset="54%" stopColor="#9B4AB0" />
            <stop offset="82%" stopColor="#6262DE" />
            <stop offset="100%" stopColor="#3B73FF" />
          </linearGradient>
        </defs>
        <path d="M18.4,0H0v18.3h18.4V0z" fill="url(#ff-ab-grad)" />
        <path
          d="M40.2,0H21.8v18.3H56v-2.6c0-4.2-1.7-8.1-4.6-11.1C48.4,1.7,44.4,0,40.2,0z"
          fill="url(#ff-ab-grad)"
        />
        <path
          d="M0,22.1v18.3c0,4.2,1.7,8.1,4.6,11.1c3,2.9,7,4.6,11.2,4.6h2.6V22.1H0z"
          fill="url(#ff-ab-grad)"
        />
        <path d="M40.2,22.1H21.8v18.3h18.4V22.1z" fill="url(#ff-ab-grad)" />
      </svg>
    </div>
  );
}

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
        borderBottom: !isLast ? "var(--border-hairline)" : "none",
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
            color: expanded ? "var(--mi-accent)" : "var(--text-tertiary)",
            flexShrink: 0,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            opacity: hasDescription ? 1 : 0.3,
          }}
        />
        <span
          style={{
            fontSize: 13,
            color: expanded ? "var(--text-primary)" : "var(--text-secondary)",
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
              background: "rgba(var(--ui-rgb), 0.06)",
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
            color: "var(--text-tertiary)",
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
            color: "var(--text-tertiary)",
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
            color: "var(--text-secondary)",
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

  const isGranola = block.source === "granola";
  const isFireflies = block.source === "fireflies";
  const isMeeting = isMeetingBlock(block.source);
  const isActive = block.isActive || block.status === "active";
  const timeRange = `${formatTime(block.startTime)} - ${block.endTime ? formatTime(block.endTime) : "now"}`;

  const hasTasks = block.taskBreakdown && block.taskBreakdown.length > 0;

  // Render markdown summary for meeting blocks and task-less session blocks
  const renderedSummaryHtml = useMemo(() => {
    if (!block.summary) return "";
    if (!isMeeting && hasTasks) return "";
    const result = marked.parse(block.summary);
    return DOMPurify.sanitize(typeof result === "string" ? result : "");
  }, [isMeeting, hasTasks, block.summary]);

  // Accent colors differ per source
  const accentColor = isGranola ? GRANOLA_GREEN : isFireflies ? FIREFLIES_PINK : "var(--mi-accent)";
  const meetingBorder = isGranola ? GRANOLA_BORDER : FIREFLIES_BORDER;

  const cardBorder = isActive
    ? "rgba(var(--status-success-rgb), 0.2)"
    : isExpanded
      ? isMeeting
        ? meetingBorder
        : "rgba(var(--mi-accent-rgb), 0.18)"
      : "rgba(var(--ui-rgb), 0.08)";

  return (
    <div
      style={{
        background:
          isMeeting && isExpanded
            ? isGranola
              ? "rgba(200, 230, 74, 0.02)"
              : "rgba(232, 67, 147, 0.02)"
            : "var(--bg-raised)",
        border: `0.5px solid ${cardBorder}`,
        borderRadius: 10,
        overflow: "hidden",
        marginBottom: 8,
      }}
    >
      {/* Header -- always visible */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: isMeeting ? 10 : 14,
          padding: "14px 16px",
          cursor: "pointer",
        }}
      >
        <ChevronRight
          size={13}
          style={{
            color: isExpanded ? accentColor : "var(--text-tertiary)",
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            flexShrink: 0,
          }}
        />
        {isMeeting && (isGranola ? <GranolaIcon size="sm" /> : <FirefliesLogo size={22} />)}

        {isMeeting ? (
          <span
            style={{
              fontSize: 13,
              color: isExpanded ? "var(--text-primary)" : "var(--text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            {block.name || "Meeting"}
          </span>
        ) : (
          <>
            <span
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                color: isExpanded ? accentColor : "var(--text-tertiary)",
                flexShrink: 0,
              }}
            >
              Block {blockNumber}
            </span>
            <span style={{ fontSize: 13, color: "var(--text-secondary)", flexShrink: 0 }}>
              {timeRange}
            </span>
            <div style={{ flex: 1, minWidth: 0 }} />
          </>
        )}

        {!isMeeting && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: "var(--text-secondary)",
              flexShrink: 0,
            }}
          >
            <Clock size={12} style={{ color: "var(--text-tertiary)" }} />
            {formatDuration(block.duration)}
          </span>
        )}

        {!isMeeting &&
          (isActive ? (
            <span
              style={{
                padding: "3px 8px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                background: "rgba(var(--status-success-rgb), 0.14)",
                color: "var(--status-success)",
                border: "0.5px solid rgba(var(--status-success-rgb), 0.28)",
              }}
            >
              Active
            </span>
          ) : block.status === "summarizing" ? (
            <span
              style={{
                padding: "3px 8px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "rgba(99, 102, 241, 0.14)",
                color: "#818CF8",
                border: "0.5px solid rgba(99, 102, 241, 0.28)",
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  animation: "spin 1s linear infinite",
                }}
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Summarizing
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
                background: "rgba(var(--ui-rgb), 0.07)",
                color: "var(--text-secondary)",
              }}
            >
              Ready
            </span>
          ))}

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
              color: "var(--text-tertiary)",
              opacity: 0.5,
              transition: "opacity 0.15s ease, color 0.15s ease",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "1";
              e.currentTarget.style.color = "var(--status-error)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "0.5";
              e.currentTarget.style.color = "var(--text-tertiary)";
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
            borderTop: `0.5px solid ${
              isMeeting
                ? isGranola
                  ? "rgba(200, 230, 74, 0.08)"
                  : "rgba(232, 67, 147, 0.08)"
                : "rgba(var(--ui-rgb), 0.06)"
            }`,
            padding: "0 16px 16px",
          }}
        >
          {/* -- Meeting body (Granola / Fireflies) -- */}
          {isMeeting && (
            <>
              {/* Subscriber / client name */}
              {block.subscriberName && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "12px 0 0",
                  }}
                >
                  <User size={11} style={{ color: accentColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: accentColor }}>{block.subscriberName}</span>
                </div>
              )}

              {/* Participants */}
              {block.participants && block.participants.length > 0 && (
                <>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      padding: block.subscriberName ? "14px 0 6px" : "14px 0 6px",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Users size={11} style={{ color: "var(--text-tertiary)" }} />
                    Participants
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {block.participants.map((p, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: 11,
                          color: "var(--text-secondary)",
                          background: "rgba(var(--ui-rgb), 0.05)",
                          padding: "3px 8px",
                          borderRadius: 4,
                          border: "var(--border-hairline)",
                        }}
                      >
                        {p.name || p.email}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {/* Meeting notes (markdown, scrollable) */}
              {renderedSummaryHtml && (
                <>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      padding: "14px 0 6px",
                    }}
                  >
                    Notes
                  </div>
                  <div
                    style={{
                      maxHeight: 280,
                      overflowY: "auto",
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      lineHeight: 1.6,
                    }}
                    className="granola-notes-scroll"
                    dangerouslySetInnerHTML={{ __html: renderedSummaryHtml }}
                  />
                </>
              )}
            </>
          )}

          {/* -- Regular work block body -- */}
          {!isMeeting && (
            <>
              {/* Tasks section */}
              {block.taskBreakdown && block.taskBreakdown.length > 0 ? (
                <>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      padding: "14px 0 8px",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <TrendingUp size={11} style={{ color: "var(--text-tertiary)" }} />
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
              ) : block.summary ? (
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
                    Summary
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#9B9689",
                      lineHeight: 1.6,
                      padding: "0 0 8px",
                    }}
                    className="granola-notes-scroll"
                    dangerouslySetInnerHTML={{ __html: renderedSummaryHtml }}
                  />
                </>
              ) : null}

              {/* App breakdown section */}
              {block.appBreakdown && block.appBreakdown.length > 0 && (
                <>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-tertiary)",
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
                    <LayoutList size={11} style={{ color: "var(--text-tertiary)" }} />
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
                          idx < block.appBreakdown.length - 1 ? "var(--border-hairline)" : "none",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          color: "var(--text-secondary)",
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
                            background: "rgba(var(--ui-rgb), 0.06)",
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
                          color: "var(--text-tertiary)",
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
                          color: "var(--text-tertiary)",
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
