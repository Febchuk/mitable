"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { initialsFor } from "@/components/montessori/data";
import type { Tone } from "@/components/montessori/data";
import { PageHeader, cardHeaderStyle, cardStyle } from "@/components/montessori/page-header";
import { Avatar, HandUnderline } from "@/components/montessori/primitives";
import type { CapturedTodayEntry, DraftReport, TodayAttendance } from "@/lib/queries/today";

const TONES: Tone[] = ["clay", "sage", "butter", "blue", "terracotta"];

function toneFor(id: string): Tone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

/** Calendar date only — UTC so SSR (Node) and the browser agree (no locale / TZ mismatch). */
function todayLabel(dateString: string): string {
  try {
    const parts = dateString.split("-").map(Number);
    const y = parts[0];
    const m = parts[1];
    const day = parts[2];
    if (!y || !m || !day) return dateString;
    const d = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return dateString;
  }
}

function timeOfDay(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function shortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function TodayClient({
  firstName,
  attendance,
  captured,
  drafts,
}: {
  firstName: string | null;
  attendance: TodayAttendance;
  captured: CapturedTodayEntry[];
  drafts: DraftReport[];
}) {
  const greetingName = firstName?.trim() || "there";
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);
  const greeting = hydrated ? `Good ${timeOfDay()}` : "Good day";
  const dateLabel = todayLabel(attendance.date);

  const presentStudents = attendance.students.filter((s) => s.status === "present");
  const placeholderCount = Math.max(0, attendance.totalStudents - presentStudents.length);

  return (
    <div>
      {/* Mobile-only header — replaces the desktop "Today" PageHeader */}
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
        {attendance.classroomName && (
          <div
            style={{
              marginTop: 14,
              fontSize: 15,
              color: "var(--color-ink-secondary)",
              lineHeight: 1.45,
            }}
          >
            {attendance.classroomName} · {attendance.totalStudents}{" "}
            {attendance.totalStudents === 1 ? "child" : "children"} on the roster.
          </div>
        )}
      </div>

      {/* Desktop header */}
      <div className="hidden lg:block">
        <PageHeader
          overline={dateLabel}
          title="Today"
          subtitle={
            attendance.classroomName
              ? `${attendance.classroomName} · ${attendance.totalStudents} children on the roster.`
              : "No active classroom yet."
          }
        />
      </div>

      <div
        className="lg:grid lg:grid-cols-[2fr_1fr] lg:gap-8"
        style={{ padding: "16px 24px 60px" }}
      >
        <div>
          {/* Attendance card */}
          <Link
            href="/app/attendance"
            className="tap"
            style={{
              width: "100%",
              textAlign: "left",
              ...cardStyle,
              padding: 0,
              cursor: "pointer",
              display: "block",
              color: "inherit",
              textDecoration: "none",
            }}
          >
            <div className="card-header-borderless-mobile" style={cardHeaderStyle}>
              <div className="label-cap" style={{ color: "var(--color-ink-secondary)" }}>
                {attendance.classroomName ?? "No classroom"}
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
                  style={{
                    fontSize: 40,
                    fontWeight: 600,
                    color: "var(--color-ink)",
                  }}
                >
                  {attendance.presentCount}
                </span>
                <span style={{ fontSize: 14, color: "var(--color-ink-secondary)" }}>
                  of {attendance.totalStudents}{" "}
                  {attendance.totalStudents === 1 ? "child" : "children"} present
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                {presentStudents.map((s) => (
                  <Avatar
                    key={s.id}
                    initials={initialsFor(s.preferredName || s.fullName)}
                    tone={toneFor(s.id)}
                    size={30}
                  />
                ))}
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
          </Link>

          {/* Mobile-only: section label sits OUTSIDE the card */}
          <div
            className="lg:hidden label-cap"
            style={{
              color: "var(--color-ink-muted)",
              padding: "22px 4px 10px",
            }}
          >
            Captured today
          </div>

          {/* Captured today card */}
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

        {/* Right rail: drafts + prompt card (desktop only) */}
        <div className="hidden lg:block">
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div className="label-cap" style={{ color: "var(--color-ink-secondary)" }}>
                Drafts
              </div>
              <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
                {drafts.length} {drafts.length === 1 ? "report" : "reports"}
              </span>
            </div>
            {drafts.length === 0 && (
              <div
                style={{
                  padding: 24,
                  fontSize: 13,
                  color: "var(--color-ink-muted)",
                  textAlign: "center",
                }}
              >
                All caught up.
              </div>
            )}
            {drafts.map((d) => (
              <Link
                key={d.id}
                href={`/app/reports?open=${encodeURIComponent(d.id)}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 18px",
                  borderTop: "1px solid var(--color-border)",
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                <Avatar
                  initials={initialsFor(d.studentName)}
                  tone={toneFor(d.studentId)}
                  size={28}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{d.studentName}</div>
                  <div style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>
                    {d.reportType === "daily" ? "Daily report" : "Major report"}
                    {d.title ? ` · ${d.title}` : ""}
                  </div>
                </div>
                <ChevronRight size={14} strokeWidth={1.5} />
              </Link>
            ))}
          </div>
          <div
            style={{
              marginTop: 18,
              padding: 22,
              background: "var(--color-surface)",
              borderRadius: 14,
              border: "1px solid var(--color-border)",
            }}
          >
            <div
              className="font-display"
              style={{ fontSize: 24, color: "var(--color-ink)", lineHeight: 1.15 }}
            >
              Take your time.
            </div>
            <div style={{ marginTop: 4, marginBottom: 10 }}>
              <HandUnderline width={120} color="var(--color-terracotta)" />
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--color-ink-secondary)",
                lineHeight: 1.55,
              }}
            >
              Tap <em>Ask Mitable</em> any time — by voice, photo, or note. Nothing syncs until you
              approve.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
