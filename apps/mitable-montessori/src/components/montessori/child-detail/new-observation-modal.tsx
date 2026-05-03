"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LEVELS, type Level } from "./mock-data";
import { CloseIcon } from "./icons";
import { ToastBus } from "../primitives";
import type { PageView } from "./child-page-header";
import type { CurriculumByTopic } from "@/lib/queries/curriculum";
import type { AxisWithAssessment } from "@/lib/queries/whole-child";

type Props = {
  open: boolean;
  pageView: PageView;
  onClose: () => void;
  mobile: boolean;
  studentId: string;
  axes: AxisWithAssessment[];
  curriculum: CurriculumByTopic[];
};

const STUB_CONFIG: Record<"activity", { sub: string; fields: string[]; cta: string }> = {
  activity: {
    sub: "A material the child worked with today.",
    fields: ["Material", "Curriculum area", "Comment (optional)"],
    cta: "Save observation",
  },
};

const TRANSITIONS = [
  { value: "introduced", label: "Introduced" },
  { value: "practicing", label: "Practicing" },
  { value: "mastered", label: "Mastered" },
] as const;

export function NewObservationModal({
  open,
  pageView,
  onClose,
  mobile,
  studentId,
  axes,
  curriculum,
}: Props) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
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
        <ModalHeader tabLabel={tabLabel} pageView={pageView} onClose={onClose} />
        {pageView === "whole" && (
          <WholeChildForm studentId={studentId} axes={axes} onClose={onClose} onSaved={onClose} />
        )}
        {pageView === "curriculum" && (
          <CurriculumForm
            studentId={studentId}
            curriculum={curriculum}
            onClose={onClose}
            onSaved={onClose}
          />
        )}
        {pageView === "activity" && <StubFields onClose={onClose} />}
      </div>
    </div>
  );
}

const SUB_FOR: Record<PageView, string> = {
  whole: "Capture what you observed and which dimension it shifted.",
  curriculum: "Tag a subtopic and the level the child is working at.",
  activity: STUB_CONFIG.activity.sub,
};

function ModalHeader({
  tabLabel,
  pageView,
  onClose,
}: {
  tabLabel: string;
  pageView: PageView;
  onClose: () => void;
}) {
  const sub = SUB_FOR[pageView];
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
      <div>
        <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 4 }}>
          {tabLabel}
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-ink)" }}>
          New observation
        </div>
        <div style={{ fontSize: 12.5, color: "var(--color-ink-secondary)", marginTop: 4 }}>
          {sub}
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
  );
}

function StubFields({ onClose }: { onClose: () => void }) {
  const c = STUB_CONFIG.activity;
  return (
    <>
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
        <button
          type="button"
          className="primary-btn tap"
          onClick={() => {
            ToastBus.push({ message: "Saving from this tab is coming soon" });
            onClose();
          }}
        >
          {c.cta}
        </button>
      </div>
    </>
  );
}

function WholeChildForm({
  studentId,
  axes,
  onClose,
  onSaved,
}: {
  studentId: string;
  axes: AxisWithAssessment[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [axisKey, setAxisKey] = React.useState<string>(axes[0]?.key ?? "");
  const selected = axes.find((a) => a.key === axisKey);
  const currentLevel: Level | null = selected?.level ?? null;

  const [movesAxis, setMovesAxis] = React.useState(false);
  const [toLevel, setToLevel] = React.useState<Level>(currentLevel ?? "Practicing");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // When axis changes, reset the to-level default to one step above current.
  React.useEffect(() => {
    setMovesAxis(false);
    if (currentLevel) {
      const idx = LEVELS.indexOf(currentLevel);
      setToLevel(LEVELS[Math.min(idx + 1, LEVELS.length - 1)]);
    } else {
      setToLevel("Emerging");
    }
  }, [axisKey, currentLevel]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!axisKey || note.trim().length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/students/${studentId}/whole-child-observations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          axisKey,
          fromLevel: movesAxis ? currentLevel : null,
          toLevel: movesAxis ? toLevel : null,
          note: note.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) {
        setError(body.error || `Save failed (${res.status})`);
        setSaving(false);
        return;
      }
      ToastBus.push({ message: "Observation saved" });
      onSaved();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    background: "var(--color-canvas)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    fontSize: 13,
    color: "var(--color-ink)",
  };

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
          Axis
        </span>
        <select
          value={axisKey}
          onChange={(e) => setAxisKey(e.target.value)}
          style={inputStyle}
          required
        >
          {axes.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
              {a.level ? ` · ${a.level}` : " · Not yet assessed"}
            </option>
          ))}
        </select>
      </label>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: "var(--color-ink-secondary)",
        }}
      >
        <input
          type="checkbox"
          checked={movesAxis}
          onChange={(e) => setMovesAxis(e.target.checked)}
        />
        This note moves the level
        {currentLevel && (
          <span style={{ color: "var(--color-ink-muted)" }}>(from {currentLevel})</span>
        )}
      </label>

      {movesAxis && (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
            New level
          </span>
          <select
            value={toLevel}
            onChange={(e) => setToLevel(e.target.value as Level)}
            style={inputStyle}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      )}

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
          Note
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          required
          maxLength={2000}
          placeholder="What did you observe?"
          style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
        />
      </label>

      {error && (
        <div
          role="alert"
          style={{
            fontSize: 12.5,
            color: "var(--color-terracotta-deep)",
            background: "var(--color-terracotta-soft)",
            border: "1px solid var(--color-terracotta)",
            borderRadius: 8,
            padding: "8px 10px",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
        <button type="button" className="ghost-btn tap" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button
          type="submit"
          className="primary-btn tap"
          disabled={saving || !axisKey || note.trim().length === 0}
        >
          {saving ? "Saving…" : "Save observation"}
        </button>
      </div>
    </form>
  );
}

function CurriculumForm({
  studentId,
  curriculum,
  onClose,
  onSaved,
}: {
  studentId: string;
  curriculum: CurriculumByTopic[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const firstSubtopicId = curriculum[0]?.subtopics[0]?.subtopicId ?? "";
  const [subtopicId, setSubtopicId] = React.useState<string>(firstSubtopicId);
  const [movesState, setMovesState] = React.useState(false);
  const [transitionToStatus, setTransitionToStatus] =
    React.useState<(typeof TRANSITIONS)[number]["value"]>("practicing");
  const [comment, setComment] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset transition default to one step above current when subtopic changes.
  React.useEffect(() => {
    setMovesState(false);
    let current: string | null = null;
    for (const t of curriculum) {
      const s = t.subtopics.find((sub) => sub.subtopicId === subtopicId);
      if (s) {
        current = s.status;
        break;
      }
    }
    if (current === "introduced") setTransitionToStatus("practicing");
    else if (current === "practicing") setTransitionToStatus("mastered");
    else setTransitionToStatus("introduced");
  }, [subtopicId, curriculum]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subtopicId || comment.trim().length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/students/${studentId}/curriculum-events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subtopicId,
          comment: comment.trim(),
          transitionToStatus: movesState ? transitionToStatus : null,
        }),
      });
      const body = await res.json().catch(() => ({}) as { error?: string; warning?: string });
      if (!res.ok) {
        setError(body.error || `Save failed (${res.status})`);
        setSaving(false);
        return;
      }
      ToastBus.push({ message: body.warning || "Observation saved" });
      onSaved();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    background: "var(--color-canvas)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    fontSize: 13,
    color: "var(--color-ink)",
  };

  if (curriculum.length === 0) {
    return (
      <div
        style={{
          padding: 16,
          background: "var(--color-canvas)",
          border: "1px solid var(--color-border)",
          borderRadius: 10,
          fontSize: 13,
          color: "var(--color-ink-muted)",
        }}
      >
        No subtopics on this child&apos;s curriculum yet. Ask your admin to set one up first.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
          Subtopic
        </span>
        <select
          value={subtopicId}
          onChange={(e) => setSubtopicId(e.target.value)}
          style={inputStyle}
          required
        >
          {curriculum.map((t) => (
            <optgroup key={t.topicId} label={t.topicName}>
              {t.subtopics.map((s) => (
                <option key={s.subtopicId} value={s.subtopicId}>
                  {s.name} · {s.status}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: "var(--color-ink-secondary)",
        }}
      >
        <input
          type="checkbox"
          checked={movesState}
          onChange={(e) => setMovesState(e.target.checked)}
        />
        This note moves the state
      </label>

      {movesState && (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
            New state
          </span>
          <select
            value={transitionToStatus}
            onChange={(e) =>
              setTransitionToStatus(e.target.value as (typeof TRANSITIONS)[number]["value"])
            }
            style={inputStyle}
          >
            {TRANSITIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
          Comment
        </span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          required
          maxLength={2000}
          placeholder="What did the child do?"
          style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
        />
      </label>

      {error && (
        <div
          role="alert"
          style={{
            fontSize: 12.5,
            color: "var(--color-terracotta-deep)",
            background: "var(--color-terracotta-soft)",
            border: "1px solid var(--color-terracotta)",
            borderRadius: 8,
            padding: "8px 10px",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
        <button type="button" className="ghost-btn tap" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button
          type="submit"
          className="primary-btn tap"
          disabled={saving || !subtopicId || comment.trim().length === 0}
        >
          {saving ? "Saving…" : "Save observation"}
        </button>
      </div>
    </form>
  );
}
