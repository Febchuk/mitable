"use client";

import * as React from "react";
import Link from "next/link";
import { Avatar } from "../primitives";
import { initialsFor } from "../data";
import type { Tone } from "../data";
import type { StudentProfile } from "@/lib/queries/student-profile";
import { ChevLeft, InfoIcon, Kebab } from "./icons";

export type PageView = "whole" | "curriculum" | "activity";

const TONES: Tone[] = ["clay", "sage", "butter", "blue", "terracotta"];

/** Stable pseudo-random tone derived from the student id. UI decoration only. */
function toneFor(id: string): Tone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

function ageFromBirthDate(birthDate: string | null): string | null {
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

function HeaderInfoTooltip({ profile, mobile }: { profile: StudentProfile; mobile: boolean }) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={wrapRef}
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
    >
      <button
        type="button"
        className="tap"
        aria-label="About this view"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          border: "1px solid var(--color-border)",
          background: open ? "var(--color-ink)" : "var(--color-surface)",
          color: open ? "var(--color-surface)" : "var(--color-ink-secondary)",
          display: "grid",
          placeItems: "center",
          padding: 0,
        }}
      >
        <InfoIcon />
      </button>
      {open && (
        <div
          className="anim-fade-in"
          role="tooltip"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 40,
            width: mobile ? "min(290px, calc(100vw - 32px))" : 340,
            maxWidth: mobile ? "calc(100vw - 32px)" : "none",
            background: "var(--color-surface)",
            color: "var(--color-ink)",
            border: "1px solid var(--color-border)",
            borderRadius: 14,
            padding: "16px 18px",
            boxShadow: "0 18px 40px rgba(42,39,35,0.16), 0 6px 14px rgba(42,39,35,0.08)",
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 10 }}>
            About {profile.fullName.split(" ")[0]}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              rowGap: 6,
              columnGap: 14,
              fontSize: 12.5,
            }}
          >
            {profile.birthDate && (
              <>
                <span style={{ color: "var(--color-ink-muted)" }}>Born</span>
                <span className="font-numeric">
                  {profile.birthDate}
                  {ageFromBirthDate(profile.birthDate)
                    ? ` · ${ageFromBirthDate(profile.birthDate)}`
                    : ""}
                </span>
              </>
            )}
            {profile.classroom && (
              <>
                <span style={{ color: "var(--color-ink-muted)" }}>Classroom</span>
                <span>
                  {profile.classroom.name}
                  {profile.primaryTeacher ? ` · ${profile.primaryTeacher.name}` : ""}
                </span>
              </>
            )}
            {profile.enrollmentStartDate && (
              <>
                <span style={{ color: "var(--color-ink-muted)" }}>Enrolled</span>
                <span className="font-numeric">{profile.enrollmentStartDate}</span>
              </>
            )}
            {profile.notes && (
              <>
                <span style={{ color: "var(--color-ink-muted)" }}>Notes</span>
                <span>{profile.notes}</span>
              </>
            )}
          </div>
          {profile.guardians.length > 0 && (
            <div
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: "1px solid var(--color-border)",
              }}
            >
              <div
                className="label-cap"
                style={{ color: "var(--color-ink-muted)", marginBottom: 8 }}
              >
                Guardians
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {profile.guardians.map((g) => (
                  <div key={g.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "baseline",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</span>
                      <span style={{ fontSize: 11.5, color: "var(--color-ink-muted)" }}>
                        {g.relationship}
                        {g.primary ? " · primary" : ""}
                      </span>
                    </div>
                    {g.contact && (
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--color-ink-secondary)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {g.contact}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

function MobileKebabMenu({
  onNewObservation,
  onGenerateReport,
}: {
  onNewObservation: () => void;
  onGenerateReport: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = [
    {
      key: "obs",
      label: "+ New observation",
      onClick: () => {
        setOpen(false);
        onNewObservation();
      },
    },
    {
      key: "rep",
      label: "Generate report",
      onClick: () => {
        setOpen(false);
        onGenerateReport();
      },
    },
  ];

  return (
    <span ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="tap"
        aria-label="More actions"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          border: "1px solid var(--color-border)",
          background: open ? "var(--color-ink)" : "var(--color-surface)",
          color: open ? "var(--color-surface)" : "var(--color-ink-secondary)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Kebab />
      </button>
      {open && (
        <div
          className="anim-fade-in"
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 50,
            minWidth: 220,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: 4,
            boxShadow: "0 18px 40px rgba(42,39,35,0.16), 0 4px 10px rgba(42,39,35,0.06)",
          }}
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              className="tap"
              onClick={it.onClick}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                background: "transparent",
                border: 0,
                borderRadius: 8,
                fontSize: 13.5,
                color: "var(--color-ink)",
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function GuardianChip({ profile }: { profile: StudentProfile }) {
  const gs = profile.guardians;
  if (gs.length === 0) return null;
  const lasts = gs.map((g) => g.name.split(" ").slice(-1)[0]);
  const sameLast = lasts.every((l) => l === lasts[0]);
  const names = sameLast
    ? gs.map((g) => g.name.split(" ")[0]).join(" & ") + " " + lasts[0]
    : gs.map((g) => g.name).join(" & ");
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 9px",
        borderRadius: 999,
        background: "transparent",
        border: "1px solid var(--color-border)",
        fontSize: 11,
        color: "var(--color-ink-secondary)",
        whiteSpace: "nowrap",
      }}
    >
      <span className="label-cap" style={{ color: "var(--color-ink-muted)", fontSize: 9.5 }}>
        Guardians
      </span>
      <span style={{ color: "var(--color-ink-muted)", opacity: 0.5 }}>·</span>
      <span style={{ fontWeight: 500 }}>{names}</span>
    </span>
  );
}

export function ChildPageHeader({
  profile,
  mobile,
  onNewObservation,
  onGenerateReport,
}: {
  profile: StudentProfile;
  mobile: boolean;
  onNewObservation: () => void;
  onGenerateReport: () => void;
}) {
  const displayName = profile.preferredName || profile.fullName;
  const tone = toneFor(profile.id);
  const age = ageFromBirthDate(profile.birthDate);
  return (
    <div
      style={{
        padding: mobile ? "16px 16px 16px" : "26px 28px 18px",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: mobile ? 14 : 12,
        }}
      >
        <Link
          href="/app/roster"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12.5,
            color: "var(--color-ink-muted)",
            textDecoration: "none",
          }}
        >
          <ChevLeft />
          <span>All children</span>
        </Link>
        {mobile && (
          <MobileKebabMenu
            onNewObservation={onNewObservation}
            onGenerateReport={onGenerateReport}
          />
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: mobile ? 12 : 18, alignItems: "center" }}>
          <Avatar initials={initialsFor(displayName)} tone={tone} size={mobile ? 56 : 72} />

          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1
                style={{
                  fontSize: mobile ? 22 : 26,
                  fontWeight: 600,
                  margin: 0,
                  color: "var(--color-ink)",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.1,
                }}
              >
                {displayName}
              </h1>
              <HeaderInfoTooltip profile={profile} mobile={mobile} />
            </div>
            <div className="meta-row label-cap" style={{ marginTop: mobile ? 4 : 6 }}>
              {age && <span>{age}</span>}
              {age && profile.classroom && <span className="dot-sep" />}
              {profile.classroom && <span>{profile.classroom.name}</span>}
              {!mobile && profile.enrollmentStartDate && (
                <>
                  <span className="dot-sep" />
                  <span>Enrolled {profile.enrollmentStartDate}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {!mobile && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 12,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="ghost-btn tap" onClick={onNewObservation}>
                + New observation
              </button>
              <button type="button" className="ghost-btn tap">
                Edit
              </button>
              <button type="button" className="primary-btn tap" onClick={onGenerateReport}>
                Generate report
              </button>
            </div>
            <GuardianChip profile={profile} />
          </div>
        )}
      </div>
    </div>
  );
}

export function ViewToggle({
  value,
  onChange,
  mobile,
}: {
  value: PageView;
  onChange: (v: PageView) => void;
  mobile: boolean;
}) {
  const opts: { key: PageView; label: string }[] = [
    { key: "whole", label: "Whole child" },
    { key: "curriculum", label: "Curriculum" },
    { key: "activity", label: "Activity" },
  ];
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "color-mix(in srgb, var(--color-canvas) 92%, transparent)",
        backdropFilter: "saturate(140%) blur(8px)",
        borderBottom: "1px solid var(--color-border)",
        padding: mobile ? "10px 16px" : "12px 28px",
        display: "flex",
        justifyContent: mobile ? "stretch" : "center",
      }}
    >
      <div
        role="tablist"
        aria-label="Detail view"
        style={{
          display: "inline-flex",
          gap: 0,
          padding: 3,
          background: "var(--color-muted)",
          borderRadius: 999,
          width: mobile ? "100%" : "auto",
        }}
      >
        {opts.map((opt) => {
          const active = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              role="tab"
              aria-selected={active}
              className="tap"
              onClick={() => onChange(opt.key)}
              style={{
                flex: mobile ? 1 : "0 0 auto",
                padding: mobile ? "8px 10px" : "7px 18px",
                borderRadius: 999,
                background: active ? "var(--color-surface)" : "transparent",
                color: active ? "var(--color-ink)" : "var(--color-ink-secondary)",
                border: 0,
                fontSize: mobile ? 12.5 : 13,
                fontWeight: 500,
                boxShadow: active ? "0 1px 2px rgba(42,39,35,0.06)" : "none",
                whiteSpace: "nowrap",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
