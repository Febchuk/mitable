"use client";

import * as React from "react";
import { MessageSquare, Plus } from "lucide-react";
import type { ReportDetail, ReportSection } from "../data";
import { ToastBus } from "../primitives";
import { Bolt } from "./icons";

const COMING_SOON = "Editing this section is coming soon — chat assistant will land first.";
const toast = (msg = COMING_SOON) => ToastBus.push({ message: msg });

export function ReportPane({ detail }: { detail: ReportDetail }) {
  const [title, setTitle] = React.useState(detail.title);

  return (
    <main className="rd-pane rd-report-pane">
      <div className="rd-report-scroll scroll-quiet">
        <article className="rd-report-paper">
          <div className="rd-report-meta">
            <span className="rd-label-cap" style={{ color: "var(--color-sage-deep)" }}>
              Daily report
            </span>
            <span style={{ color: "var(--color-ink-muted)" }}>·</span>
            <span style={{ fontSize: 12.5, color: "var(--color-ink-secondary)" }}>
              {detail.dayLabel} · {detail.classroom}
            </span>
          </div>

          <input
            className="rd-report-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            spellCheck={false}
            aria-label="Report title"
          />

          <div className="rd-report-byline">
            <span>Observed by {detail.observer}</span>
            <span className="rd-dot-sep" />
            <span>
              {detail.sources.voiceNotes} voice notes · {detail.sources.photos} photos ·{" "}
              {detail.sources.worksheets} worksheet{detail.sources.worksheets === 1 ? "" : "s"}
            </span>
          </div>

          {detail.sections.map((section) => (
            <SectionBlock key={section.id} section={section} />
          ))}

          <button type="button" className="rd-add-section" onClick={() => toast()}>
            <Plus size={13} strokeWidth={2} />
            Add section
          </button>
        </article>
      </div>

      <div className="rd-report-footer">
        <div className="rd-footer-left">
          <span className="rd-label-cap">Visible to</span>
          <span>{detail.visibleTo.join(" · ")}</span>
        </div>
        <div className="rd-footer-right">
          <button type="button" className="rd-btn rd-btn-ghost" onClick={() => toast()}>
            Reject draft
          </button>
          <button type="button" className="rd-btn rd-btn-secondary" onClick={() => toast()}>
            Save &amp; close
          </button>
        </div>
      </div>
    </main>
  );
}

function SectionBlock({ section }: { section: ReportSection }) {
  const [ghostDismissed, setGhostDismissed] = React.useState(false);
  const showGhost = section.ghostEdit && !ghostDismissed;

  return (
    <div className="rd-section">
      <div className="rd-section-heading">{section.heading}</div>

      {section.paragraphs.map((p) => (
        <div className="rd-para-block" key={p.id}>
          <div className="rd-para-actions">
            <button
              type="button"
              className="rd-para-action"
              onClick={() => toast()}
              title={COMING_SOON}
            >
              <MessageSquare size={11} strokeWidth={2} />
              Discuss
            </button>
          </div>
          <p className="rd-para-text" dangerouslySetInnerHTML={{ __html: p.html }} />
        </div>
      ))}

      {showGhost && section.ghostEdit && (
        <div className="rd-ghost-edit">
          <div className="rd-ghost-edit-label">
            <Bolt size={11} />
            Suggested addition · {section.ghostEdit.sourceLabel}
          </div>
          <div
            className="rd-ghost-edit-text"
            dangerouslySetInnerHTML={{ __html: section.ghostEdit.html }}
          />
          <div className="rd-ghost-edit-actions">
            <button type="button" className="rd-ghost-btn rd-accept" onClick={() => toast()}>
              Accept
            </button>
            <button
              type="button"
              className="rd-ghost-btn"
              onClick={() => {
                setGhostDismissed(true);
                ToastBus.push({ message: "Suggestion dismissed" });
              }}
            >
              Reject
            </button>
            <button
              type="button"
              className="rd-ghost-btn"
              style={{ marginLeft: "auto" }}
              onClick={() => toast()}
            >
              Edit first
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
