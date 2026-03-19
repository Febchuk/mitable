import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, FileText, Plus } from "lucide-react";
import {
  fetchAskThreads,
  fetchAskThreadMessages,
  type AskMessageRow,
  type AskThread,
} from "@/console/src/services/adminService";

interface ReportItem {
  id: string;
  threadId: string;
  threadTitle: string;
  title: string;
  subtitle: string;
  createdAt: string;
}

function groupReportsByDate(reports: ReportItem[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; reports: ReportItem[] }[] = [
    { label: "Today", reports: [] },
    { label: "Yesterday", reports: [] },
    { label: "This week", reports: [] },
    { label: "Earlier", reports: [] },
  ];

  reports.forEach((report) => {
    const createdAt = new Date(report.createdAt);
    const reportDay = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());

    if (reportDay.getTime() >= today.getTime()) {
      groups[0].reports.push(report);
    } else if (reportDay.getTime() >= yesterday.getTime()) {
      groups[1].reports.push(report);
    } else if (reportDay.getTime() >= weekAgo.getTime()) {
      groups[2].reports.push(report);
    } else {
      groups[3].reports.push(report);
    }
  });

  return groups.filter((group) => group.reports.length > 0);
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
}

const REPORT_AVATAR_COLORS = ["#9B84E8", "#3A9B6B", "#D4A27A", "#4A9FD9", "#E87474", "#9B9689"];

function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return REPORT_AVATAR_COLORS[Math.abs(hash) % REPORT_AVATAR_COLORS.length];
}

function getReportInitial(title: string): string {
  return (title || "R").charAt(0).toUpperCase();
}

async function fetchReportsIndex(): Promise<ReportItem[]> {
  const threads = await fetchAskThreads();
  const settled = await Promise.allSettled(
    threads.map(async (thread) => {
      const messages = await fetchAskThreadMessages(thread.id);
      return messages
        .filter((row) => row.reportTitle && row.reportHtml)
        .map((row) => mapReportRow(thread, row));
    })
  );

  return settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function mapReportRow(thread: AskThread, row: AskMessageRow): ReportItem {
  return {
    id: row.id,
    threadId: thread.id,
    threadTitle: thread.title,
    title: row.reportTitle || "Untitled report",
    subtitle: row.reportSubtitle || thread.title,
    createdAt: row.createdAt,
  };
}

export default function ReportsView() {
  const navigate = useNavigate();
  const { data: reports = [], isLoading, error } = useQuery({
    queryKey: ["admin", "reports", "index"],
    queryFn: fetchReportsIndex,
  });

  const groupedReports = useMemo(() => groupReportsByDate(reports), [reports]);

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 0",
        }}
      >
        <Loader2 size={24} style={{ color: "#9B84E8", animation: "spin 1s linear infinite" }} />
        <p style={{ color: "#6B665C", fontSize: 13, marginTop: 12 }}>Loading reports...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 0",
        }}
      >
        <AlertCircle size={24} style={{ color: "#E87474", marginBottom: 12 }} />
        <p style={{ color: "#ECE8E0", fontSize: 13, fontWeight: 500 }}>Failed to load reports</p>
      </div>
    );
  }

  return (
    <div className="app-no-drag" style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 32,
              color: "#ECE8E0",
              fontWeight: 400,
              letterSpacing: "-0.4px",
              lineHeight: 1,
              margin: 0,
            }}
          >
            Reports
          </h1>
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 15,
              color: "#6B665C",
              fontWeight: 400,
              fontStyle: "italic",
              margin: "12px 0 0",
            }}
          >
            Generated from admin Ask conversations
          </p>
        </div>

        <button
          onClick={() => navigate("/ask")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 8,
            border: "0.5px solid rgba(236, 232, 224, 0.12)",
            background: "transparent",
            color: "#ECE8E0",
            fontSize: 12,
            fontFamily: "var(--font-sans)",
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.15s ease",
            marginTop: 4,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(236, 232, 224, 0.05)";
            e.currentTarget.style.borderColor = "rgba(236, 232, 224, 0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "rgba(236, 232, 224, 0.12)";
          }}
        >
          <Plus size={12} strokeWidth={2} />
          New
        </button>
      </div>

      {groupedReports.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {groupedReports.map((group) => (
            <div key={group.label}>
              <div
                style={{
                  fontSize: 12,
                  color: "#6B665C",
                  fontWeight: 500,
                  marginBottom: 8,
                }}
              >
                {group.label}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {group.reports.map((report) => {
                  const color = getAvatarColor(report.id);
                  const initial = getReportInitial(report.title);

                  return (
                    <div
                      key={report.id}
                      onClick={() =>
                        navigate(
                          `/ask?threadId=${encodeURIComponent(report.threadId)}&messageId=${encodeURIComponent(report.id)}`
                        )
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: 8,
                        cursor: "pointer",
                        transition: "background 0.12s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(236, 232, 224, 0.04)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 7,
                          background: `${color}20`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontSize: 13,
                          fontWeight: 600,
                          color,
                        }}
                      >
                        {initial}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#ECE8E0",
                            fontWeight: 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {report.title}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "#6B665C",
                            marginTop: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {report.subtitle}
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: 12,
                          color: "#6B665C",
                          flexShrink: 0,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatTime(report.createdAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ paddingTop: 40 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "48px 0",
              borderRadius: 12,
              border: "0.5px dashed rgba(236, 232, 224, 0.1)",
            }}
          >
            <FileText size={20} style={{ color: "#6B665C", marginBottom: 12 }} />
            <p style={{ color: "#9B9689", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              No reports yet
            </p>
            <p
              style={{
                color: "#6B665C",
                fontSize: 12,
                textAlign: "center",
                maxWidth: 260,
                lineHeight: 1.5,
              }}
            >
              Generate your first report from the Ask view and it will appear here.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
