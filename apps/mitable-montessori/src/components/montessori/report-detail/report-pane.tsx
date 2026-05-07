"use client";

import * as React from "react";
import { Check, MessageSquare, Plus, Trash2, X } from "lucide-react";
import type { ReportDetail, ReportSection } from "../data";
import { ToastBus } from "../primitives";
import { Bolt } from "./icons";

const COMING_SOON = "Editing this section is coming soon — chat assistant will land first.";
const toast = (msg = COMING_SOON) => ToastBus.push({ message: msg });

type ReportPaneProps = {
  detail: ReportDetail;
  onChange: (next: ReportDetail) => void;
  /** True while POST /draft is filling the report from capture — blocks edits on this pane only. */
  isDrafting?: boolean;
  /** Aborts the in-flight /draft request (client-side); optional for tests. */
  onCancelDrafting?: () => void;
  /** When the user clicks "Discuss" on a paragraph, scope the chat to it. */
  onDiscussParagraph?: (sectionId: string, paragraphId: string) => void;
};

function newId(prefix: string) {
  // Stable enough for in-session ids; persistence will assign real ones.
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ReportPane({
  detail,
  onChange,
  isDrafting = false,
  onCancelDrafting,
  onDiscussParagraph,
}: ReportPaneProps) {
  const [addingSection, setAddingSection] = React.useState(false);
  // ID of a paragraph that should grab focus on next render (e.g. the empty
  // paragraph in a freshly-created section).
  const [pendingFocusParagraphId, setPendingFocusParagraphId] = React.useState<string | null>(null);

  const onTitleChange = (title: string) => onChange({ ...detail, title });

  const onParagraphCommit = React.useCallback(
    (sectionId: string, paragraphId: string, html: string) => {
      const sections = detail.sections.map((section) => {
        if (section.id !== sectionId) return section;
        const paragraphs = section.paragraphs.map((p) =>
          p.id === paragraphId ? { ...p, html } : p
        );
        return { ...section, paragraphs };
      });
      onChange({ ...detail, sections });
    },
    [detail, onChange]
  );

  const onCreateSection = (heading: string) => {
    const trimmed = heading.trim();
    if (!trimmed) {
      setAddingSection(false);
      return;
    }
    const paragraphId = newId("p");
    const section: ReportSection = {
      id: newId("s"),
      heading: trimmed,
      paragraphs: [{ id: paragraphId, html: "" }],
    };
    onChange({ ...detail, sections: [...detail.sections, section] });
    setAddingSection(false);
    setPendingFocusParagraphId(paragraphId);
  };

  const onDeleteSection = (sectionId: string) => {
    const sections = detail.sections.filter((s) => s.id !== sectionId);
    onChange({ ...detail, sections });
  };

  const clearPendingFocus = React.useCallback(() => setPendingFocusParagraphId(null), []);

  return (
    <main className="rd-pane rd-report-pane">
      <div className="rd-report-scroll scroll-quiet">
        <article className="rd-report-paper">
          <input
            className="rd-report-title-input"
            value={detail.title}
            onChange={(e) => onTitleChange(e.target.value)}
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
            <SectionBlock
              key={section.id}
              section={section}
              pendingFocusParagraphId={pendingFocusParagraphId}
              onParagraphFocused={clearPendingFocus}
              onParagraphCommit={(paragraphId, html) =>
                onParagraphCommit(section.id, paragraphId, html)
              }
              onDelete={() => onDeleteSection(section.id)}
              onDiscussParagraph={
                onDiscussParagraph
                  ? (paragraphId) => onDiscussParagraph(section.id, paragraphId)
                  : undefined
              }
            />
          ))}

          {addingSection ? (
            <NewSectionPrompt onCreate={onCreateSection} onCancel={() => setAddingSection(false)} />
          ) : (
            <button type="button" className="rd-add-section" onClick={() => setAddingSection(true)}>
              <Plus size={13} strokeWidth={2} />
              Add section
            </button>
          )}
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

      {isDrafting ? (
        <div
          className="rd-report-loading-overlay"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Report loading"
        >
          <div className="rd-report-loading-card">
            <span className="rd-report-loading-spinner" aria-hidden />
            <p>Report loading</p>
            {onCancelDrafting ? (
              <button type="button" className="rd-report-loading-cancel" onClick={onCancelDrafting}>
                Stop drafting
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function NewSectionPrompt({
  onCreate,
  onCancel,
}: {
  onCreate: (heading: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="rd-new-section-prompt" role="group" aria-label="New section">
      <div className="rd-new-section-row">
        <span className="rd-section-heading">New section</span>
        <input
          ref={inputRef}
          className="rd-new-section-input"
          value={value}
          placeholder="e.g. Outdoor, Math, Practical life"
          aria-label="New section heading"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCreate(value);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          onBlur={() => {
            // Blur cancels if nothing has been typed; otherwise commit.
            if (!value.trim()) onCancel();
            else onCreate(value);
          }}
        />
      </div>
      <div className="rd-new-section-hint">
        <span>
          <span className="rd-kbd">Enter</span> to create · <span className="rd-kbd">Esc</span> to
          cancel
        </span>
      </div>
    </div>
  );
}

function SectionBlock({
  section,
  pendingFocusParagraphId,
  onParagraphFocused,
  onParagraphCommit,
  onDelete,
  onDiscussParagraph,
}: {
  section: ReportSection;
  pendingFocusParagraphId: string | null;
  onParagraphFocused: () => void;
  onParagraphCommit: (paragraphId: string, html: string) => void;
  onDelete: () => void;
  onDiscussParagraph?: (paragraphId: string) => void;
}) {
  const [ghostDismissed, setGhostDismissed] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const showGhost = section.ghostEdit && !ghostDismissed;

  return (
    <div className="rd-section">
      <div className="rd-section-heading-row">
        <div className="rd-section-heading">{section.heading}</div>
        <div className="rd-section-actions">
          {confirmingDelete ? (
            <span className="rd-section-confirm" role="group" aria-label="Confirm delete section">
              <span className="rd-section-confirm-label">Delete this section?</span>
              <button
                type="button"
                className="rd-section-confirm-btn rd-section-confirm-yes"
                onClick={() => {
                  onDelete();
                  ToastBus.push({ message: `Deleted "${section.heading}" section` });
                }}
                aria-label="Confirm delete"
              >
                <Check size={12} strokeWidth={2.5} />
                Delete
              </button>
              <button
                type="button"
                className="rd-section-confirm-btn"
                onClick={() => setConfirmingDelete(false)}
                aria-label="Cancel delete"
              >
                <X size={12} strokeWidth={2.5} />
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="rd-section-delete"
              onClick={() => setConfirmingDelete(true)}
              aria-label={`Delete ${section.heading} section`}
              title="Delete section"
            >
              <Trash2 size={12} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {section.paragraphs.map((p) => (
        <div className="rd-para-block" key={p.id}>
          <div className="rd-para-actions">
            <button
              type="button"
              className="rd-para-action"
              onClick={() =>
                onDiscussParagraph
                  ? onDiscussParagraph(p.id)
                  : toast("Open the editing assistant on the left to discuss this paragraph.")
              }
              title="Discuss this paragraph in the chat"
            >
              <MessageSquare size={11} strokeWidth={2} />
              Discuss
            </button>
          </div>
          <EditableParagraph
            html={p.html}
            ariaLabel={`${section.heading} paragraph`}
            autoFocus={pendingFocusParagraphId === p.id}
            onAutoFocused={onParagraphFocused}
            onCommit={(next) => onParagraphCommit(p.id, next)}
          />
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

/**
 * A contenteditable <p> seeded with `html` once on mount, and re-seeded
 * from props only while it is NOT focused. Commits its current innerHTML
 * via `onCommit` on blur. Pasted content is sanitized to plain text;
 * Enter inserts a <br>, not a new paragraph block. When `autoFocus` is
 * true, focuses on next render and calls `onAutoFocused` to clear the
 * upstream signal.
 */
function EditableParagraph({
  html,
  ariaLabel,
  autoFocus = false,
  onAutoFocused,
  onCommit,
}: {
  html: string;
  ariaLabel: string;
  autoFocus?: boolean;
  onAutoFocused?: () => void;
  onCommit: (next: string) => void;
}) {
  const ref = React.useRef<HTMLParagraphElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof document !== "undefined" && document.activeElement === el) return;
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [html]);

  React.useEffect(() => {
    if (!autoFocus) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    onAutoFocused?.();
  }, [autoFocus, onAutoFocused]);

  return (
    <p
      ref={ref}
      className="rd-para-text"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      onBlur={(e) => {
        const next = (e.currentTarget as HTMLElement).innerHTML;
        if (next !== html) onCommit(next);
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        // execCommand is deprecated but remains the simplest cross-browser
        // way to insert plain text at the caret without pulling in a
        // rich-text editor library. Replace if/when we adopt one.
        document.execCommand("insertText", false, text);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          document.execCommand("insertLineBreak");
        }
      }}
    />
  );
}
