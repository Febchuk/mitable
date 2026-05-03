"use client";

import * as React from "react";
import Link from "next/link";
import { Avatar } from "../primitives";
import type { Child } from "../data";
import { initialsFor } from "../data";
import { CHILD_PROFILE } from "./mock-data";
import { ChevLeft, CloseIcon, InfoIcon, Kebab } from "./icons";

export type PageView = "whole" | "curriculum" | "activity";

function HeaderInfoTooltip({ mobile }: { mobile: boolean }) {
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
            About {CHILD_PROFILE.fullName.split(" ")[0]}
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
            <span style={{ color: "var(--color-ink-muted)" }}>Born</span>
            <span className="font-numeric">
              {CHILD_PROFILE.dob} · {CHILD_PROFILE.age}
            </span>
            <span style={{ color: "var(--color-ink-muted)" }}>Pronouns</span>
            <span>{CHILD_PROFILE.pronouns}</span>
            <span style={{ color: "var(--color-ink-muted)" }}>Classroom</span>
            <span>
              {CHILD_PROFILE.classroom} · {CHILD_PROFILE.primaryTeacher}
            </span>
            <span style={{ color: "var(--color-ink-muted)" }}>Enrolled</span>
            <span>{CHILD_PROFILE.enrolled}</span>
            <span style={{ color: "var(--color-ink-muted)" }}>Allergies</span>
            <span>{CHILD_PROFILE.allergies}</span>
          </div>
          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: "1px solid var(--color-border)",
            }}
          >
            <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 8 }}>
              Guardians
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CHILD_PROFILE.guardians.map((g) => (
                <div key={g.name} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div
                    style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</span>
                    <span style={{ fontSize: 11.5, color: "var(--color-ink-muted)" }}>
                      {g.relationship}
                      {g.primary ? " · primary" : ""}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--color-ink-secondary)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {g.contact}
                  </span>
                </div>
              ))}
            </div>
          </div>
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

function GuardianChip() {
  const gs = CHILD_PROFILE.guardians;
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
  child,
  mobile,
  onNewObservation,
  onGenerateReport,
}: {
  child: Child;
  mobile: boolean;
  onNewObservation: () => void;
  onGenerateReport: () => void;
}) {
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
          <Avatar initials={initialsFor(child.name)} tone={child.tone} size={mobile ? 56 : 72} />

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
                {child.name}
              </h1>
              <HeaderInfoTooltip mobile={mobile} />
            </div>
            <div className="meta-row label-cap" style={{ marginTop: mobile ? 4 : 6 }}>
              <span>{child.age}</span>
              <span className="dot-sep" />
              <span>{CHILD_PROFILE.classroom}</span>
              {!mobile && (
                <>
                  <span className="dot-sep" />
                  <span>Enrolled {child.enrolled}</span>
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
            <GuardianChip />
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

type NewObservationModalProps = {
  open: boolean;
  pageView: PageView;
  onClose: () => void;
  mobile: boolean;
};

const MODAL_CONFIG: Record<PageView, { sub: string; fields: string[]; cta: string }> = {
  whole: {
    sub: "Capture what you observed and which dimension it shifted.",
    fields: ["Axis (Concentration, Self-Correction…)", "Level transition (optional)", "Note"],
    cta: "Save observation",
  },
  curriculum: {
    sub: "Tag a subtopic and the level Ada is working at.",
    fields: ["Topic / Subtopic", "State (Introduced · Practicing · Mastered)", "Comment"],
    cta: "Save observation",
  },
  activity: {
    sub: "A material Ada worked with today.",
    fields: ["Material", "Curriculum area", "Comment (optional)"],
    cta: "Save observation",
  },
};

export function NewObservationModal({ open, pageView, onClose, mobile }: NewObservationModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const c = MODAL_CONFIG[pageView];
  const tabLabel =
    pageView === "whole" ? "Whole child" : pageView === "curriculum" ? "Curriculum" : "Activity";

  return (
    <div
      className="anim-fade-in"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(42,39,35,0.42)",
        zIndex: 90,
        display: "flex",
        alignItems: mobile ? "flex-end" : "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        className="anim-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)",
          borderTopLeftRadius: mobile ? 22 : 18,
          borderTopRightRadius: mobile ? 22 : 18,
          borderBottomLeftRadius: mobile ? 0 : 18,
          borderBottomRightRadius: mobile ? 0 : 18,
          width: mobile ? "100%" : "min(560px, 92%)",
          maxHeight: mobile ? "82vh" : "92vh",
          overflow: "auto",
          padding: mobile ? "20px 16px 28px" : "24px 26px 22px",
          boxShadow: "0 -10px 30px rgba(42,39,35,0.22)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14 }}
        >
          <div>
            <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 4 }}>
              {tabLabel}
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-ink)" }}>
              New observation
            </div>
            <div style={{ fontSize: 12.5, color: "var(--color-ink-secondary)", marginTop: 4 }}>
              {c.sub}
            </div>
          </div>
          <button
            type="button"
            className="tap"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              background: "var(--color-canvas)",
              color: "var(--color-ink-secondary)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <CloseIcon />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {c.fields.map((label) => (
            <div
              key={label}
              style={{
                background: "var(--color-canvas)",
                border: "1px dashed var(--color-border)",
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: 13,
                color: "var(--color-ink-muted)",
                fontStyle: "italic",
              }}
            >
              {label}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" className="ghost-btn tap" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-btn tap" onClick={onClose}>
            {c.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
