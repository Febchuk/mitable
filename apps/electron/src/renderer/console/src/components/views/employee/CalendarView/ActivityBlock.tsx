import { useState, useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { ChevronRight, Clock, TrendingUp, LayoutList, Trash2, Users, User } from "lucide-react";
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
const GRANOLA_GREEN = "#C8E64A";
const GRANOLA_BORDER = "rgba(200, 230, 74, 0.18)";
const FIREFLIES_PINK = "#E84393";
const FIREFLIES_BORDER = "rgba(232, 67, 147, 0.18)";

function isMeetingBlock(source?: string): boolean {
  return source === "granola" || source === "fireflies";
}

/** Granola spiral icon in rounded dark container (matches integrations page) */
function GranolaLogo({ size = 24 }: { size?: number }) {
  const iconSize = Math.round(size * 0.6);
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
      <svg
        viewBox="0 0 1308 1350"
        width={iconSize}
        height={iconSize}
        fill={GRANOLA_GREEN}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M1033.77,1021.55c-21.6,24.24-40.11,38.92-50.31,45.93c-4.8,3.19-7.8,7.65-11.99,11.48 c-22.2,19.14-46.26,24.83-63.06,38.23c-22.8,17.86-107.98,39.1-132.18,46.54c-40.96,9.31-87.03,12.67-137.43,10.75 c-10.91,0-20.99,0-30.26-0.73c-3.76-0.29-7.54,0.68-11.31,0.72c-0.15,0-0.29,0-0.42,0c-0.4,0-1.07-0.29-2.01-0.86 c-1.06-0.65-2.26-1.06-3.51-1.06c-0.33,0-0.65-0.03-0.97-0.07c-5.08-0.7-7.78,1.09-9.73,2.08c-1.48,0.75-3.09,0.12-4.49-0.77 c-4.43-2.81-14.32-9.14-17.68-10.16c-3.32-1.01-3.64,0.37-5.41,0.68c-1.18,0.21-2.41-0.21-3.3-1.01 c-0.99-0.9-2.06-2.2-4.5-3.5c-4.49-2.39-6.88,3.04-13.55-3.03c-0.97-0.88-1.54-2.61-2.85-2.7c-0.33-0.02-0.56-0.04-0.89-0.1 c-6.72-1.3-18.92-3.8-27.12-6.29c-9.6-2.55-6.61-4.46-10.81-6.37c-56.4-21.05-136.79-62.52-166.19-91.86 c-10.8-10.84-23.4-35.72-31.2-42.1c-6-5.1-18-15.31-21-20.41c-2.4-4.47,0-12.75-4.2-18.49 c-5.4-7.02-16.2-10.85-26.4-26.79c-11.4-17.86-18-41.46-29.4-65.7C202,854.91,175,786.02,175,660.36 c0-84.2,39-200.93,55.8-216.88c10.8-10.21,9.6-32.53,17.39-43.37c89.01-123.75,244.8-214.79,430.2-224.35 c7.53-0.39,15.07-0.63,22.62-0.72c45.74-0.53,91.58,4.47,136.04,15.31c44.41,10.83,86.87,27.73,128.26,46.95 c0,0,4.91,0.39,6.21,1.03c2.16,1.06,3.07,2.99,5.23,4.06c2.16,1.06,5.28,0.16,7.64,0.64c7.77,1.59,9.17,6.21,10.6,8.05 c1.74,2.23,3.83,3.09,7.78,4.22c10.31,2.96,11.67,6.37,13.07,7.94c1.12,1.25,1.61,2.88,2.17,4.34 c0.57,1.48,1.7,2.84,3.28,3.21c3.42,0.8,8.06,4.98,9.02,10.69c0.63,3.72,4.65,5.32,3.55,12.3 c-0.36,2.26,2.05,5.6-10.6,18.07s-39.18,20.33-55.34,14.14c-55.85-21.41-64.13-25.53-86.57-31.65 c-40.96-11.17-75.85-18.76-118.36-17.96c-67.8,1.28-121.21,7.66-185.41,29.98c-28.14,9.97-81.27,37.11-107.93,58.24 c-26.66,21.13-65.26,50.32-81.19,77.33c-5.58,9.46-11.86,18.5-25.06,33.17c-19.2,21.05-41.42,81.93-48.62,111.28 c-1.8,6.38,2.99,13.4,0.59,19.78c-2.4,7.02-13.8,10.21-15,15.95c-4.8,20.41-3.6,46.56-3.6,68.88 c0,12.12,3.6,28.7,7.8,38.27c3,6.38,12.6,10.85,13.8,17.22c0.6,4.46-5.39,9.56-5.4,13.39c0,3.19,5.39,46.57,8.39,52.95 c4.2,7.65,17.4,17.22,21,26.15c6,13.39,0,15.31,9.6,30.63c4.2,7.02,7.2,14.67,13.2,20.41 c11.4,10.84,16.8,26.79,30.6,40.82c12,11.48,21,14.04,29.4,27.42c7.2,11.48,16.2,14.67,24,22.33 c12,12.12,24,18.49,36.59,28.7c17.4,14.03,39,25.51,52.8,34.53c15,9.56,24.6,25.51,50.4,30.62 c13.2,2.55,42.6,20.41,58.8,25.51c6.6,2.55,12.6,7.02,21.6,8.29c12,1.27,24,4.46,36,6.38c12.6,1.91,27,0.64,40.2,1.91 c14.4,1.28,26.4,0.64,40.2,0.64c32.4,0,73.8-4.46,103.8-15.31c13.8-5.1,19.2-8.29,34.2-14.67c37.2-15.31,61.8-29.35,81-45.93 c38.4-33.26,73.2-66.52,91.2-108.6c1.2-3.19,6.6-4.46,7.2-6.38c3-10.21,0.6-14.03,2.4-21.69 c3-12.12,16.8-22.33,14.4-53.59c-0.6-6.38-5.4-12.76-5.4-17.86c-0.6-14.67,8.4-31.89,2.4-58.05c-1.22-5.1-18-10.21-18-21.05 c0-3.83-3-7.02,0-14.67s-1.2-15.31-1.2-22.96c0-9.56,2.4-18.49,0-28.07c-1.8-7.65,3-14.67,0-23.6 c-3.6-10.85-3.6-17.22-3.6-29.34c0-8.92-7.2-21.69-1.8-34.44c5.4-11.48,20.4-13.39,33-13.39c13.8,0,25.8,0,33,6.38 c4.8,4.46,4.8,6.38,8.4,15.31c1.56,3.83,5.21,32.48,5.4,39.54c0.6,15.94-5.4,26.15-4.8,38.27c1.2,18.49,6,33.17,4.2,52.29 c-1.2,12.76,1.2,25.51-1.2,42.73c-2.4,16.58-4.8,32.53-9.6,45.93c-4.8,12.12-2.4,33.17-12,48.48 c-6,10.21-17.4,21.69-23.4,35.72C1076.37,968.63,1061.97,989.68,1033.77,1021.55z" />
      </svg>
    </div>
  );
}

/** Fireflies.ai logo — official geometric mark (pink→purple→blue gradient) */
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

  const isGranola = block.source === "granola";
  const isFireflies = block.source === "fireflies";
  const isMeeting = isMeetingBlock(block.source);
  const isActive = block.isActive || block.status === "active";
  const timeRange = `${formatTime(block.startTime)} – ${block.endTime ? formatTime(block.endTime) : "now"}`;

  // Render markdown summary for meeting blocks
  const renderedSummaryHtml = useMemo(() => {
    if (!isMeeting || !block.summary) return "";
    const result = marked.parse(block.summary);
    return DOMPurify.sanitize(typeof result === "string" ? result : "");
  }, [isMeeting, block.summary]);

  // Accent colors differ per source
  const accentColor = isGranola ? GRANOLA_GREEN : isFireflies ? FIREFLIES_PINK : "#9B84E8";
  const meetingBorder = isGranola ? GRANOLA_BORDER : FIREFLIES_BORDER;

  const cardBorder = isActive
    ? "rgba(58, 155, 107, 0.2)"
    : isExpanded
      ? isMeeting
        ? meetingBorder
        : "rgba(155, 132, 232, 0.18)"
      : "rgba(236, 232, 224, 0.08)";

  return (
    <div
      style={{
        background:
          isMeeting && isExpanded
            ? isGranola
              ? "rgba(200, 230, 74, 0.02)"
              : "rgba(232, 67, 147, 0.02)"
            : "#211F1B",
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
          gap: isMeeting ? 10 : 14,
          padding: "14px 16px",
          cursor: "pointer",
        }}
      >
        {isMeeting ? (
          isGranola ? (
            <GranolaLogo size={22} />
          ) : (
            <FirefliesLogo size={22} />
          )
        ) : (
          <ChevronRight
            size={13}
            style={{
              color: isExpanded ? accentColor : "#6B665C",
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
              flexShrink: 0,
            }}
          />
        )}

        {isMeeting ? (
          <span
            style={{
              fontSize: 13,
              color: isExpanded ? "#ECE8E0" : "#9B9689",
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
                color: isExpanded ? accentColor : "#6B665C",
                flexShrink: 0,
              }}
            >
              Block {blockNumber}
            </span>
            <span style={{ fontSize: 13, color: "#9B9689", flexShrink: 0 }}>{timeRange}</span>
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
              color: "#9B9689",
              flexShrink: 0,
            }}
          >
            <Clock size={12} style={{ color: "#6B665C" }} />
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
            borderTop: `0.5px solid ${
              isMeeting
                ? isGranola
                  ? "rgba(200, 230, 74, 0.08)"
                  : "rgba(232, 67, 147, 0.08)"
                : "rgba(236, 232, 224, 0.06)"
            }`,
            padding: "0 16px 16px",
          }}
        >
          {/* ── Meeting body (Granola / Fireflies) ── */}
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
                      color: "#6B665C",
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      padding: block.subscriberName ? "14px 0 6px" : "14px 0 6px",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Users size={11} style={{ color: "#6B665C" }} />
                    Participants
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {block.participants.map((p, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: 11,
                          color: "#9B9689",
                          background: "rgba(236, 232, 224, 0.05)",
                          padding: "3px 8px",
                          borderRadius: 4,
                          border: "0.5px solid rgba(236, 232, 224, 0.06)",
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
                      color: "#6B665C",
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
                      color: "#9B9689",
                      lineHeight: 1.6,
                    }}
                    className="granola-notes-scroll"
                    dangerouslySetInnerHTML={{ __html: renderedSummaryHtml }}
                  />
                </>
              )}
            </>
          )}

          {/* ── Regular work block body ── */}
          {!isMeeting && (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
