import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertCircle, Plus, Lock } from "lucide-react";
import { useDocuments } from "@/console/src/hooks/queries/documents";
import CreateDocumentModal from "../../employee/DocsView/dialogs/CreateDocumentModal";
import { groupByDay } from "@/console/src/components/shared/groupByDay";
import type { Document } from "@mitable/shared";

function isReportDocument(doc: Document): boolean {
  return doc.tags?.includes("report") ?? false;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
}

function getReportInitial(title: string): string {
  return (title || "R").charAt(0).toUpperCase();
}

export default function ReportsView() {
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { data, isLoading, error } = useDocuments();
  const reports = useMemo(() => {
    const documents = data?.documents || [];
    return documents.filter((doc) => isReportDocument(doc));
  }, [data?.documents]);

  const groupedReports = useMemo(() => groupByDay(reports, (r) => r.updatedAt), [reports]);

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
        <Loader2
          size={24}
          style={{ color: "var(--mi-accent)", animation: "spin 1s linear infinite" }}
        />
        <p style={{ color: "var(--text-tertiary)", fontSize: 13, marginTop: 12 }}>
          Loading reports...
        </p>
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
        <AlertCircle size={24} style={{ color: "var(--status-error)", marginBottom: 12 }} />
        <p style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 500 }}>
          Failed to load reports
        </p>
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
              color: "var(--text-primary)",
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
              color: "var(--text-tertiary)",
              fontWeight: 400,
              fontStyle: "italic",
              margin: "12px 0 0",
            }}
          >
            Generate reports on any work done by your team
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 8,
            border: "var(--border-subtle)",
            background: "transparent",
            color: "var(--text-primary)",
            fontSize: 12,
            fontFamily: "var(--font-sans)",
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.15s ease",
            marginTop: 4,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.05)";
            e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.12)";
          }}
        >
          <Plus size={12} strokeWidth={2} />
          New
        </button>
      </div>

      {groupedReports.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {groupedReports.map((group) => (
            <div key={group.label}>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  fontWeight: 500,
                  marginBottom: 8,
                }}
              >
                {group.label}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {group.items.map((report) => {
                  const initial = getReportInitial(report.title);
                  const creatorName = report.creator
                    ? `${report.creator.firstName} ${report.creator.lastName}`.trim()
                    : "Unknown";

                  return (
                    <div
                      key={report.id}
                      onClick={() => navigate(`/reports/${report.id}`)}
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
                        e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.04)";
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
                          background: "rgba(var(--ui-rgb), 0.06)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text-tertiary)",
                        }}
                      >
                        {initial}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--text-primary)",
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
                            color: "var(--text-tertiary)",
                            marginTop: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {creatorName}
                        </div>
                      </div>

                      {report.status === "draft" && (
                        <Lock size={12} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                      )}

                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-tertiary)",
                          flexShrink: 0,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatTime(report.updatedAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateDocumentModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        routeBase="/reports"
        entityLabel="report"
        promptPlaceholder="What will your report be about?"
        defaultTags={["report"]}
      />
    </div>
  );
}
