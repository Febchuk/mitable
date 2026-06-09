"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check } from "lucide-react";
import { initialsFor } from "@/components/montessori/data";
import type { Tone } from "@/components/montessori/data";
import { PageHeader, cardHeaderStyle, cardStyle } from "@/components/montessori/page-header";
import { Avatar } from "@/components/montessori/primitives";
import type { AdminPendingReport, AdminSchoolAttendance } from "@/lib/queries/admin-today";
import type { CapturedTodayEntry } from "@/lib/queries/today";

const TONES: Tone[] = ["clay", "sage", "butter", "blue", "terracotta"];

function toneFor(id: string): Tone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

function timeOfDay(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function shortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatUpdatedShort(iso: string): string {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " + shortTime(iso)
    );
  } catch {
    return "";
  }
}

function reportKindLabel(t: AdminPendingReport["reportType"]): string {
  if (t === "daily") return "Daily";
  if (t === "major") return "Major";
  return "Incident";
}

type AdminTodayClientProps = {
  firstName: string | null;
  schoolName?: string | null;
  dateLabel: string;
  attendance: AdminSchoolAttendance;
  captured: CapturedTodayEntry[];
  pendingReports: AdminPendingReport[];
};

export default function AdminTodayClient({
  firstName,
  schoolName = null,
  dateLabel,
  attendance,
  captured,
  pendingReports,
}: AdminTodayClientProps) {
  const router = useRouter();
  const [hydrated, setHydrated] = React.useState(false);
  const [approveBusy, setApproveBusy] = React.useState<string | null>(null);
  React.useEffect(() => setHydrated(true), []);

  const greetingName = firstName?.trim() || "there";
  const greeting = hydrated ? `Good ${timeOfDay()}` : "Good day";
  const attendanceLabel = schoolName ?? "School-wide";

  const placeholderCount = Math.max(
    0,
    attendance.totalStudents - attendance.presentStudents.length
  );

  async function handleApprove(reportId: string) {
    setApproveBusy(reportId);
    try {
      const res = await fetch("/api/v1/reports/approve", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId }),
      });
      if (res.ok) router.refresh();
    } finally {
      setApproveBusy(null);
    }
  }

  return (
    <div>
      {/* Mobile-only header */}
      <div className="lg:hidden" style={{ padding: "26px 22px 10px" }}>
        <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 10 }}>
          {dateLabel}
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 32,
            fontWeight: 700,
            color: "var(--color-ink)",
            letterSpacing: "-0.015em",
            lineHeight: 1.1,
          }}
        >
          {greeting},{" "}
          <span
            className="font-display"
            style={{
              fontWeight: 500,
              fontSize: 38,
              color: "var(--color-terracotta-deep)",
            }}
          >
            {greetingName}
          </span>
        </h1>
        <div
          style={{
            marginTop: 14,
            fontSize: 15,
            color: "var(--color-ink-secondary)",
            lineHeight: 1.45,
          }}
        >
          A snapshot of every classroom today.
        </div>
      </div>

      {/* Desktop header */}
      <div className="hidden lg:block">
        <PageHeader title="Today" subtitle="Across the school today." />
      </div>

      <div
        className="lg:grid lg:grid-cols-[2fr_1fr] lg:gap-8"
        style={{ padding: "16px 24px 60px" }}
      >
        <div>
          <button
            type="button"
            className="tap"
            onClick={() => router.push("/admin/classrooms")}
            style={{
              width: "100%",
              textAlign: "left",
              ...cardStyle,
              padding: 0,
              cursor: "pointer",
            }}
          >
            <div className="card-header-borderless-mobile" style={cardHeaderStyle}>
              <div className="label-cap" style={{ color: "var(--color-ink-secondary)" }}>
                {attendanceLabel}
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--color-sage)",
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span className="live-dot" />
                Attendance open
              </span>
            </div>
            <div className="card-body-tight-mobile" style={{ padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span
                  className="font-numeric"
                  style={{ fontSize: 40, fontWeight: 600, color: "var(--color-ink)" }}
                >
                  {attendance.presentCount}
                </span>
                <span style={{ fontSize: 14, color: "var(--color-ink-secondary)" }}>
                  of {attendance.totalStudents}{" "}
                  {attendance.totalStudents === 1 ? "child" : "children"} present across the school
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                {attendance.presentStudents.map((s) => {
                  const display = s.preferredName || s.fullName;
                  return (
                    <Avatar
                      key={s.id}
                      initials={initialsFor(display)}
                      tone={toneFor(s.id)}
                      size={30}
                    />
                  );
                })}
                {Array.from({ length: placeholderCount }).map((_, k) => (
                  <div
                    key={`a${k}`}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 999,
                      border: "1.5px dashed var(--color-border-strong)",
                      opacity: 0.5,
                    }}
                  />
                ))}
              </div>
            </div>
          </button>

          <div
            className="lg:hidden label-cap"
            style={{ color: "var(--color-ink-muted)", padding: "22px 4px 10px" }}
          >
            Captured today
          </div>

          <div style={{ ...cardStyle, marginTop: 0 }} className="lg:!mt-[18px]">
            <div
              className="hidden lg:flex"
              style={{
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 18px",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <div className="label-cap" style={{ color: "var(--color-ink-secondary)" }}>
                Captured today
              </div>
              <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
                {captured.length} {captured.length === 1 ? "entry" : "entries"}
              </span>
            </div>
            {captured.length === 0 && (
              <div
                style={{
                  padding: 20,
                  fontSize: 13,
                  color: "var(--color-ink-muted)",
                  textAlign: "center",
                }}
              >
                Nothing captured yet today.
              </div>
            )}
            {captured.map((row, i) => {
              const display = row.studentPreferredName || row.studentName;
              return (
                <Link
                  key={`${row.kind}-${row.id}`}
                  href={`/app/children/${row.studentId}`}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "14px 18px",
                    borderTop: i ? "1px solid var(--color-border)" : "none",
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  <Avatar initials={initialsFor(display)} tone={toneFor(row.studentId)} size={32} />
                  <div
                    style={{
                      flex: 1,
                      fontSize: 14,
                      color: "var(--color-ink)",
                      minWidth: 0,
                      lineHeight: 1.45,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600 }}>{display}</span>{" "}
                      <span style={{ color: "var(--color-ink-secondary)" }}>{row.comment}</span>
                    </div>
                    <div style={{ marginTop: 2, fontSize: 12, color: "var(--color-ink-muted)" }}>
                      {row.kind === "curriculum" ? "Curriculum" : "Whole child"} ·{" "}
                      {row.contextLabel} · {shortTime(row.createdAt)}
                    </div>
                  </div>
                  <ArrowUpRight
                    size={14}
                    strokeWidth={1.75}
                    style={{ color: "var(--color-ink-muted)", flexShrink: 0, marginTop: 4 }}
                  />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="hidden lg:block">
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div className="label-cap" style={{ color: "var(--color-ink-secondary)" }}>
                Pending approval
              </div>
              <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
                {pendingReports.length} report{pendingReports.length === 1 ? "" : "s"}
              </span>
            </div>
            {pendingReports.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  fontSize: 13,
                  color: "var(--color-ink-muted)",
                  textAlign: "center",
                }}
              >
                Nothing to review right now.
              </div>
            ) : (
              pendingReports.map((report, index) => (
                <div
                  key={report.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 18px",
                    borderTop: index ? "1px solid var(--color-border)" : 0,
                  }}
                >
                  <Avatar
                    initials={initialsFor(report.studentName)}
                    tone={toneFor(report.studentId)}
                    size={28}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{report.studentName}</div>
                    <div style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>
                      {reportKindLabel(report.reportType)} report ·{" "}
                      {formatUpdatedShort(report.updatedAt)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="tap"
                      onClick={() => router.push("/admin/reports")}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                        background: "transparent",
                        color: "var(--color-ink-secondary)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 7,
                        padding: "4px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      Review
                    </button>
                    <button
                      type="button"
                      className="tap"
                      disabled={approveBusy === report.id}
                      onClick={() => void handleApprove(report.id)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                        background: "var(--color-terracotta)",
                        color: "var(--color-surface)",
                        border: 0,
                        borderRadius: 7,
                        padding: "4px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                        opacity: approveBusy === report.id ? 0.7 : 1,
                      }}
                    >
                      <Check size={11} strokeWidth={2} /> Approve
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
