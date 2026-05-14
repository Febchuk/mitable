"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { initialsFor } from "@/components/montessori/data";
import type { Tone } from "@/components/montessori/data";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { Avatar } from "@/components/montessori/primitives";

const TONES: Tone[] = ["clay", "sage", "butter", "blue", "terracotta"];

export function toneFor(id: string): Tone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

export function ageFromBirthDate(birthDate: string | null | undefined): string | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  let months = now.getMonth() - d.getMonth();
  if (now.getDate() < d.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return `${years}y ${months}m`;
}

export function formatEnrolled(start: string | null): string | null {
  if (!start) return null;
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export type RosterListViewRow = {
  id: string;
  href: string;
  displayName: string;
  initialsSource: string;
  age: string | null;
  enrolledAt: string | null;
  guardianCount: number;
  /** When set, desktop grid includes a Classrooms column and mobile shows this line. */
  classroomsLine?: string | null;
  /** Optional lowercase string for filtering (e.g. admin school roster search). */
  searchHaystack?: string;
};

export function RosterListView({
  overline,
  title,
  rows,
  emptyMessage,
  toolbar,
}: {
  overline: string;
  title: string;
  rows: RosterListViewRow[];
  emptyMessage: string;
  /** Renders between the page title and the roster table (e.g. search). */
  toolbar?: React.ReactNode;
}) {
  const showClassrooms = rows.some((r) => r.classroomsLine != null && r.classroomsLine !== "");

  return (
    <div>
      <PageHeader overline={overline} title={title} />
      {toolbar}
      <div style={{ padding: "16px 24px 60px" }}>
        {rows.length === 0 ? (
          <div
            style={{
              ...cardStyle,
              padding: 24,
              textAlign: "center",
              color: "var(--color-ink-muted)",
              fontSize: 13.5,
            }}
          >
            {emptyMessage}
          </div>
        ) : (
          <>
            <div className="hidden lg:block" style={cardStyle}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: showClassrooms
                    ? "1.35fr 0.55fr 0.75fr 1.05fr 0.75fr 24px"
                    : "1.4fr 0.6fr 0.8fr 0.8fr 24px",
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                {(showClassrooms
                  ? ["Child", "Age", "Enrolled", "Classrooms", "Family", ""]
                  : ["Child", "Age", "Enrolled", "Family", ""]
                ).map((h) => (
                  <div key={h} className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                    {h}
                  </div>
                ))}
              </div>
              {rows.map((c) => (
                <RosterDesktopRow key={c.id} c={c} showClassrooms={showClassrooms} />
              ))}
            </div>

            <div className="lg:hidden" style={cardStyle}>
              {rows.map((c, i) => (
                <RosterMobileRow
                  key={c.id}
                  c={c}
                  firstRow={i === 0}
                  showClassrooms={showClassrooms}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RosterDesktopRow({
  c,
  showClassrooms,
}: {
  c: RosterListViewRow;
  showClassrooms: boolean;
}) {
  return (
    <Link
      href={c.href}
      className="tap"
      style={{
        display: "grid",
        gridTemplateColumns: showClassrooms
          ? "1.35fr 0.55fr 0.75fr 1.05fr 0.75fr 24px"
          : "1.4fr 0.6fr 0.8fr 0.8fr 24px",
        alignItems: "center",
        padding: "12px 20px",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: 0,
        borderTop: "1px solid var(--color-border)",
        color: "inherit",
        textDecoration: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Avatar initials={initialsFor(c.initialsSource)} tone={toneFor(c.id)} size={34} />
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-ink)" }}>
          {c.displayName}
        </div>
      </div>
      <div className="font-numeric" style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>
        {c.age ?? "—"}
      </div>
      <div style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>{c.enrolledAt ?? "—"}</div>
      {showClassrooms ? (
        <div style={{ fontSize: 12, color: "var(--color-ink-secondary)", lineHeight: 1.35 }}>
          {c.classroomsLine && c.classroomsLine.trim() ? c.classroomsLine : "—"}
        </div>
      ) : null}
      <div style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
        {c.guardianCount === 0
          ? "No guardian"
          : c.guardianCount === 1
            ? "1 guardian"
            : `${c.guardianCount} guardians`}
      </div>
      <ChevronRight size={14} strokeWidth={1.5} />
    </Link>
  );
}

function RosterMobileRow({
  c,
  firstRow,
  showClassrooms,
}: {
  c: RosterListViewRow;
  firstRow: boolean;
  showClassrooms: boolean;
}) {
  return (
    <Link
      href={c.href}
      className="tap"
      style={{
        width: "100%",
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        background: "transparent",
        border: 0,
        borderTop: firstRow ? "0" : "1px solid var(--color-border)",
        color: "inherit",
        textDecoration: "none",
      }}
    >
      <Avatar initials={initialsFor(c.initialsSource)} tone={toneFor(c.id)} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--color-ink)" }}>
          {c.displayName}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--color-ink-secondary)",
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {c.enrolledAt ? `Enrolled ${c.enrolledAt}` : ""}
          {showClassrooms && c.classroomsLine ? (
            <span>
              {c.enrolledAt ? " · " : ""}
              {c.classroomsLine}
            </span>
          ) : null}
        </div>
      </div>
      <div className="font-numeric" style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
        {c.age ?? ""}
      </div>
      <ChevronRight size={16} strokeWidth={1.5} />
    </Link>
  );
}
