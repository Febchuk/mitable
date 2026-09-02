"use client";

import * as React from "react";
import { Check, MessageSquare, Plus, Trash2, X } from "lucide-react";
import type { ReportDetail, ReportSection } from "../data";
import type { SectionMetaEntry } from "@/lib/report-templates/sections";
import {
  decodeFieldPayload,
  encodeChecklist,
  encodeSingleSelect,
  inferChecklistSelections,
  inferSingleSelect,
} from "@/lib/reports/template-field-payload";
import { firstOpenParagraphIndex } from "@/lib/reports/section-paragraph-slots";
import { decodeProgressTopic, type ProgressTopicRow } from "@/lib/reports/progress-topic-payload";
import { decodeExamGrades } from "@/lib/reports/exam-grades-payload";
import { isTopicCommentsHeading } from "@/lib/reports/default-classroom-report";
import { STATUS_COLOR, STATUS_LABEL, statusToMark } from "@/components/montessori/data";
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
  /**
   * Accept the ghostEdit attached to a section: appends ghost.html as a new
   * paragraph + clears the slot. The parent records the editorial action on
   * the originating chat message row.
   */
  onAcceptGhostEdit?: (sectionId: string) => void;
  /** Dismiss the ghostEdit attached to a section: clears the slot, no append. */
  onDismissGhostEdit?: (sectionId: string) => void;
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
  onAcceptGhostEdit,
  onDismissGhostEdit,
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

  const onDeleteParagraph = (sectionId: string, paragraphId: string) => {
    const sections = detail.sections.map((section) => {
      if (section.id !== sectionId) return section;
      const paragraphs = section.paragraphs.filter((p) => p.id !== paragraphId);
      return { ...section, paragraphs };
    });
    onChange({ ...detail, sections });
  };

  const clearPendingFocus = React.useCallback(() => setPendingFocusParagraphId(null), []);

  const sectionMeta = detail.templateSectionMeta ?? {};

  const sectionGroups = React.useMemo(
    () => groupReportSections(detail.sections, sectionMeta),
    [detail.sections, sectionMeta]
  );

  return (
    <main className="rd-pane rd-report-pane">
      <div className="rd-report-scroll scroll-quiet">
        <article className="rd-report-paper">
          {detail.templateLogoUrl ? (
            <img src={detail.templateLogoUrl} alt="" className="rd-report-logo" />
          ) : null}
          <input
            className="rd-report-title-input"
            value={detail.title}
            onChange={(e) => onTitleChange(e.target.value)}
            spellCheck={false}
            aria-label="Report title"
          />

          <div className="rd-report-identity">
            {detail.dayLabel ? (
              <p className="rd-report-identity-line">
                <span className="rd-report-identity-label">Date: </span>
                {detail.dayLabel}
              </p>
            ) : null}
            {detail.classroom ? (
              <p className="rd-report-identity-line">
                <span className="rd-report-identity-label">Classroom: </span>
                {detail.classroom}
              </p>
            ) : null}
            <p className="rd-report-identity-line">
              <span className="rd-report-identity-label">Observed by: </span>
              {detail.observer}
            </p>
          </div>

          {sectionGroups.map((group) =>
            group.type === "subject" ? (
              <SubjectTopicBlock
                key={group.grid.id}
                index={group.index}
                gridSection={group.grid}
                commentsSection={group.comments}
                fieldMeta={sectionMeta[group.grid.heading]}
                pendingFocusParagraphId={pendingFocusParagraphId}
                onParagraphFocused={clearPendingFocus}
                onParagraphCommit={onParagraphCommit}
                onDeleteSection={onDeleteSection}
                onDeleteParagraph={onDeleteParagraph}
                onDiscussParagraph={onDiscussParagraph}
                onAcceptGhostEdit={onAcceptGhostEdit}
                onDismissGhostEdit={onDismissGhostEdit}
              />
            ) : (
              <SectionBlock
                key={group.section.id}
                section={group.section}
                fieldMeta={sectionMeta[group.section.heading]}
                pendingFocusParagraphId={pendingFocusParagraphId}
                onParagraphFocused={clearPendingFocus}
                onParagraphCommit={(paragraphId, html) =>
                  onParagraphCommit(group.section.id, paragraphId, html)
                }
                onDelete={() => onDeleteSection(group.section.id)}
                onDeleteParagraph={(paragraphId) =>
                  onDeleteParagraph(group.section.id, paragraphId)
                }
                onDiscussParagraph={
                  onDiscussParagraph
                    ? (paragraphId) => onDiscussParagraph(group.section.id, paragraphId)
                    : undefined
                }
                onAcceptGhostEdit={
                  onAcceptGhostEdit ? () => onAcceptGhostEdit(group.section.id) : undefined
                }
                onDismissGhostEdit={
                  onDismissGhostEdit ? () => onDismissGhostEdit(group.section.id) : undefined
                }
              />
            )
          )}

          {addingSection ? (
            <NewSectionPrompt onCreate={onCreateSection} onCancel={() => setAddingSection(false)} />
          ) : (
            <button type="button" className="rd-add-section" onClick={() => setAddingSection(true)}>
              <Plus size={13} strokeWidth={2} />
              Add section
            </button>
          )}

          <p className="rd-report-paper-footer">Prepared with Mitable</p>
        </article>
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

function TemplateChecklistField({
  heading,
  options,
  html,
  onCommit,
}: {
  heading: string;
  options: string[];
  html: string;
  onCommit: (next: string) => void;
}) {
  const decoded = decodeFieldPayload(html);
  const selected =
    decoded.kind === "checklist"
      ? decoded.selected
      : decoded.kind === "legacy_prose"
        ? inferChecklistSelections(decoded.html, options)
        : [];

  const toggle = (opt: string) => {
    const nextSel = selected.includes(opt) ? selected.filter((x) => x !== opt) : [...selected, opt];
    onCommit(encodeChecklist(nextSel));
  };

  return (
    <fieldset className="rd-template-field">
      <legend className="sr-only">{heading} — checklist</legend>
      <ul className="rd-template-field-list">
        {options.map((opt) => (
          <li key={opt}>
            <label className="rd-template-field-row">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
              />
              <span>{opt}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="rd-template-field-hint">
        Pick any that apply. Your choices save automatically.
      </p>
    </fieldset>
  );
}

function TemplateSingleSelectField({
  heading,
  options,
  html,
  radioName,
  onCommit,
}: {
  heading: string;
  options: string[];
  html: string;
  radioName: string;
  onCommit: (next: string) => void;
}) {
  const decoded = decodeFieldPayload(html);
  const value =
    decoded.kind === "single_select"
      ? decoded.value
      : decoded.kind === "legacy_prose"
        ? inferSingleSelect(decoded.html, options)
        : null;

  return (
    <fieldset className="rd-template-field">
      <legend className="sr-only">{heading} — choose one</legend>
      <ul className="rd-template-field-list">
        {options.map((opt) => (
          <li key={opt}>
            <label className="rd-template-field-row">
              <input
                type="radio"
                name={radioName}
                checked={value === opt}
                onChange={() => onCommit(encodeSingleSelect(opt))}
              />
              <span>{opt}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="rd-template-field-hint">Choose one option. Your choice saves automatically.</p>
    </fieldset>
  );
}

function ProgressTopicGrid({
  heading,
  html,
  variant = "table",
}: {
  heading: string;
  html: string;
  variant?: "table" | "subject";
}) {
  const rows = decodeProgressTopic(html) ?? [];
  if (variant === "subject") {
    return <SubjectProgressList heading={heading} rows={rows} />;
  }
  return (
    <div className="rd-template-field rd-progress-topic" aria-readonly>
      <p className="sr-only">{heading} — progress grid</p>
      {rows.length === 0 ? (
        <p
          className="rd-template-hardcoded-body"
          style={{ fontStyle: "italic", color: "var(--color-ink-muted)" }}
        >
          No materials were marked during this period.
        </p>
      ) : (
        <table className="rd-progress-topic-table">
          <thead>
            <tr>
              <th scope="col">Material</th>
              <th scope="col">Status</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ProgressTopicTableRow key={row.subtopicId} row={row} />
            ))}
          </tbody>
        </table>
      )}
      <p className="rd-template-field-hint">
        Pulled from progress marks during this report&rsquo;s period — edit comments below each
        topic.
      </p>
    </div>
  );
}

/** Group flat rows by topicName for the Greenhouse-style subject layout. */
function groupRowsByTopic(
  rows: ProgressTopicRow[]
): Array<{ topicName: string; rows: ProgressTopicRow[] }> {
  const order: string[] = [];
  const map = new Map<string, ProgressTopicRow[]>();
  for (const row of rows) {
    const key = row.topicName?.trim() || "Uncategorized";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(row);
  }
  return order.map((topicName) => ({ topicName, rows: map.get(topicName)! }));
}

function SubjectProgressList({ heading, rows }: { heading: string; rows: ProgressTopicRow[] }) {
  const groups = groupRowsByTopic(rows);
  return (
    <div className="rd-subject-markings" aria-readonly>
      <p className="sr-only">{heading} — progress markings</p>
      {rows.length === 0 ? (
        <p className="rd-subject-empty">No materials were marked during this period.</p>
      ) : (
        groups.map((group) => (
          <div key={group.topicName} className="rd-subject-topic-group">
            <div className="rd-subject-topic-name">{group.topicName}</div>
            <ul className="rd-subject-row-list">
              {group.rows.map((row) => (
                <li key={row.subtopicId} className="rd-subject-row">
                  <span className="rd-subject-row-name">{row.name}</span>
                  <ProgressStatusBadge row={row} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

function ProgressStatusBadge({ row }: { row: ProgressTopicRow }) {
  const mark = statusToMark(row.status);
  return (
    <span
      className="rd-subject-badge"
      style={{
        background: STATUS_COLOR[mark],
        color: "var(--color-ink)",
        border: "1px solid var(--color-border)",
      }}
    >
      {STATUS_LABEL[mark]}
    </span>
  );
}

function ProgressTopicTableRow({ row }: { row: ProgressTopicRow }) {
  const mark = statusToMark(row.status);
  return (
    <tr>
      <td>{row.name}</td>
      <td>
        <span
          className="rd-progress-topic-badge"
          style={{
            background: STATUS_COLOR[mark],
            border: "1px solid var(--color-border)",
          }}
        >
          {STATUS_LABEL[mark]}
        </span>
      </td>
      <td>{row.comment?.trim() || "—"}</td>
    </tr>
  );
}

function ExamGradesTable({ html }: { html: string }) {
  const rows = decodeExamGrades(html) ?? [];
  return (
    <div className="rd-template-field rd-progress-topic" aria-readonly>
      {rows.length ? (
        <table className="rd-progress-topic-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Exam</th>
              <th>Result</th>
              <th>Grade</th>
              <th>Comments</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.subject}-${row.assessmentName}-${index}`}>
                <td>{row.subject}</td>
                <td>{row.assessmentName}</td>
                <td>
                  <strong>{row.percentage}%</strong>
                </td>
                <td>{row.gradeLabel}</td>
                <td>{row.comments?.trim() || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ margin: 0, color: "var(--color-ink-muted)", fontStyle: "italic" }}>
          No exam grades were recorded for this term.
        </p>
      )}
      <p className="rd-template-field-hint">Snapshot from Grades for this end-of-term report.</p>
    </div>
  );
}

type SectionGroup =
  | {
      type: "subject";
      index: number;
      grid: ReportSection;
      comments?: ReportSection;
    }
  | { type: "plain"; section: ReportSection };

function groupReportSections(
  sections: ReportSection[],
  sectionMeta: Record<string, SectionMetaEntry | undefined>
): SectionGroup[] {
  const groups: SectionGroup[] = [];
  let subjectIndex = 0;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const meta = sectionMeta[section.heading];
    if (meta?.type === "progress_topic") {
      const next = sections[i + 1];
      const comments = next && isTopicCommentsHeading(next.heading) ? next : undefined;
      if (comments) i++;
      subjectIndex++;
      groups.push({ type: "subject", index: subjectIndex, grid: section, comments });
      continue;
    }
    groups.push({ type: "plain", section });
  }
  return groups;
}

function SubjectTopicBlock({
  index,
  gridSection,
  commentsSection,
  fieldMeta,
  pendingFocusParagraphId,
  onParagraphFocused,
  onParagraphCommit,
  onAcceptGhostEdit,
  onDismissGhostEdit,
}: {
  index: number;
  gridSection: ReportSection;
  commentsSection?: ReportSection;
  fieldMeta?: SectionMetaEntry;
  pendingFocusParagraphId: string | null;
  onParagraphFocused: () => void;
  onParagraphCommit: (sectionId: string, paragraphId: string, html: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onDeleteParagraph: (sectionId: string, paragraphId: string) => void;
  onDiscussParagraph?: (sectionId: string, paragraphId: string) => void;
  onAcceptGhostEdit?: (sectionId: string) => void;
  onDismissGhostEdit?: (sectionId: string) => void;
}) {
  const gridHtml = gridSection.paragraphs[0]?.html ?? "";
  const commentPara = commentsSection?.paragraphs[0];
  const commentHtml = commentPara?.html ?? "";
  const commentEmpty = !commentHtml.replace(/<[^>]+>/g, "").trim();

  return (
    <section className="rd-subject-block">
      <h2 className="rd-subject-heading">
        <span className="rd-subject-index">{String(index).padStart(2, "0")}</span>
        {gridSection.heading}
      </h2>

      {fieldMeta?.type === "progress_topic" ? (
        <ProgressTopicGrid heading={gridSection.heading} html={gridHtml} variant="subject" />
      ) : null}

      {commentsSection && commentPara ? (
        <div className="rd-subject-comments">
          <EditableParagraph
            html={commentHtml}
            ariaLabel={`Comments for ${gridSection.heading}`}
            placeholder={commentEmpty ? "Leave a comment" : undefined}
            className="rd-comment-field"
            autoFocus={pendingFocusParagraphId === commentPara.id}
            onAutoFocused={onParagraphFocused}
            onCommit={(next) => onParagraphCommit(commentsSection.id, commentPara.id, next)}
          />
          {commentsSection.ghostEdit ? (
            <GhostSuggestionBlock
              ghost={commentsSection.ghostEdit}
              onAcceptGhostEdit={
                onAcceptGhostEdit ? () => onAcceptGhostEdit(commentsSection.id) : undefined
              }
              onDismissGhostEdit={
                onDismissGhostEdit ? () => onDismissGhostEdit(commentsSection.id) : undefined
              }
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function TemplateHardcodedField({
  heading,
  html,
  hint,
}: {
  heading: string;
  html: string;
  /** When set, replaces the default “fixed school text” hint (e.g. curriculum blocks). */
  hint?: string;
}) {
  const trimmed = html.replace(/<[^>]+>/g, "").trim();
  return (
    <div className="rd-template-field rd-template-hardcoded" aria-readonly>
      <p className="sr-only">{heading} — fixed school text</p>
      {trimmed ? (
        <div
          className="rd-template-hardcoded-body"
          dangerouslySetInnerHTML={{ __html: html || "" }}
        />
      ) : (
        <p
          className="rd-template-hardcoded-body"
          style={{ fontStyle: "italic", color: "var(--color-ink-muted)" }}
        >
          No fixed text is stored for this section yet (check the template in admin).
        </p>
      )}
      <p className="rd-template-field-hint">
        {hint ?? "Fixed text from your school&rsquo;s report template — not edited here."}
      </p>
    </div>
  );
}

function SectionBlock({
  section,
  fieldMeta,
  pendingFocusParagraphId,
  onParagraphFocused,
  onParagraphCommit,
  onDelete,
  onDeleteParagraph,
  onDiscussParagraph,
  onAcceptGhostEdit,
  onDismissGhostEdit,
}: {
  section: ReportSection;
  fieldMeta?: SectionMetaEntry;
  pendingFocusParagraphId: string | null;
  onParagraphFocused: () => void;
  onParagraphCommit: (paragraphId: string, html: string) => void;
  onDelete: () => void;
  onDeleteParagraph: (paragraphId: string) => void;
  onDiscussParagraph?: (paragraphId: string) => void;
  onAcceptGhostEdit?: () => void;
  onDismissGhostEdit?: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [confirmingDeleteParagraphId, setConfirmingDeleteParagraphId] = React.useState<
    string | null
  >(null);
  const showGhost = !!section.ghostEdit;
  const ghostOpenParagraphIndex = showGhost
    ? firstOpenParagraphIndex(section.paragraphs, fieldMeta)
    : null;
  const radioGroupName = React.useId();
  const lockedSection = fieldMeta?.type === "exam_grades";

  return (
    <div className="rd-section">
      <div className="rd-section-heading-row">
        <div className="rd-section-heading">{section.heading}</div>
        {!lockedSection ? (
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
        ) : null}
      </div>

      {section.paragraphs.map((p, paraIndex) => {
        if (showGhost && ghostOpenParagraphIndex === paraIndex && section.ghostEdit) {
          return (
            <GhostSuggestionBlock
              key={`ghost-${p.id}`}
              ghost={section.ghostEdit}
              onAcceptGhostEdit={onAcceptGhostEdit}
              onDismissGhostEdit={onDismissGhostEdit}
            />
          );
        }

        const structuredFirst =
          paraIndex === 0 &&
          fieldMeta &&
          (fieldMeta.type === "checklist" || fieldMeta.type === "single_select");
        const serverFilledFirst =
          paraIndex === 0 &&
          (fieldMeta?.type === "hardcoded" ||
            fieldMeta?.type === "curriculum" ||
            fieldMeta?.type === "progress_topic" ||
            fieldMeta?.type === "exam_grades");
        const hideParagraphDelete = structuredFirst || serverFilledFirst;

        return (
          <div className="rd-para-block" key={p.id}>
            <div className="rd-para-actions">
              {confirmingDeleteParagraphId === p.id ? (
                <span
                  className="rd-para-confirm"
                  role="group"
                  aria-label="Confirm delete paragraph"
                >
                  <span className="rd-para-confirm-label">Delete this paragraph?</span>
                  <button
                    type="button"
                    className="rd-para-action rd-para-confirm-yes"
                    onClick={() => {
                      onDeleteParagraph(p.id);
                      setConfirmingDeleteParagraphId(null);
                      ToastBus.push({ message: "Paragraph deleted" });
                    }}
                    aria-label="Confirm delete paragraph"
                  >
                    <Check size={11} strokeWidth={2.5} />
                    Delete
                  </button>
                  <button
                    type="button"
                    className="rd-para-action"
                    onClick={() => setConfirmingDeleteParagraphId(null)}
                    aria-label="Cancel delete paragraph"
                  >
                    <X size={11} strokeWidth={2.5} />
                    Cancel
                  </button>
                </span>
              ) : (
                <>
                  {!serverFilledFirst ? (
                    <button
                      type="button"
                      className="rd-para-action"
                      onClick={() =>
                        onDiscussParagraph
                          ? onDiscussParagraph(p.id)
                          : toast(
                              "Open the editing assistant on the left to discuss this paragraph."
                            )
                      }
                      title="Discuss this paragraph in the chat"
                    >
                      <MessageSquare size={11} strokeWidth={2} />
                      Discuss
                    </button>
                  ) : null}
                  {!hideParagraphDelete ? (
                    <button
                      type="button"
                      className="rd-para-action"
                      onClick={() => setConfirmingDeleteParagraphId(p.id)}
                      title="Delete this paragraph"
                      aria-label="Delete paragraph"
                    >
                      <Trash2 size={11} strokeWidth={2} />
                    </button>
                  ) : null}
                </>
              )}
            </div>
            {structuredFirst && fieldMeta.type === "checklist" ? (
              <TemplateChecklistField
                heading={section.heading}
                options={fieldMeta.options}
                html={p.html}
                onCommit={(next) => onParagraphCommit(p.id, next)}
              />
            ) : structuredFirst && fieldMeta.type === "single_select" ? (
              <TemplateSingleSelectField
                heading={section.heading}
                options={fieldMeta.options}
                html={p.html}
                radioName={radioGroupName}
                onCommit={(next) => onParagraphCommit(p.id, next)}
              />
            ) : serverFilledFirst && fieldMeta?.type === "progress_topic" ? (
              <ProgressTopicGrid heading={section.heading} html={p.html} />
            ) : serverFilledFirst && fieldMeta?.type === "exam_grades" ? (
              <ExamGradesTable html={p.html} />
            ) : serverFilledFirst ? (
              <TemplateHardcodedField
                heading={section.heading}
                html={p.html}
                hint={
                  fieldMeta?.type === "curriculum"
                    ? "Filled from this child’s speech targets. Admins edit them under Curriculum → Speech."
                    : undefined
                }
              />
            ) : (
              <EditableParagraph
                html={p.html}
                ariaLabel={`${section.heading} paragraph`}
                autoFocus={pendingFocusParagraphId === p.id}
                onAutoFocused={onParagraphFocused}
                onCommit={(next) => onParagraphCommit(p.id, next)}
              />
            )}
          </div>
        );
      })}

      {showGhost && ghostOpenParagraphIndex === null && section.ghostEdit ? (
        <GhostSuggestionBlock
          ghost={section.ghostEdit}
          onAcceptGhostEdit={onAcceptGhostEdit}
          onDismissGhostEdit={onDismissGhostEdit}
        />
      ) : null}
    </div>
  );
}

function GhostSuggestionBlock({
  ghost,
  onAcceptGhostEdit,
  onDismissGhostEdit,
}: {
  ghost: { id: string; html: string; sourceLabel: string };
  onAcceptGhostEdit?: () => void;
  onDismissGhostEdit?: () => void;
}) {
  return (
    <div className="rd-ghost-edit">
      <div className="rd-ghost-edit-label">
        <Bolt size={11} />
        Suggested addition · {ghost.sourceLabel}
      </div>
      <div className="rd-ghost-edit-text" dangerouslySetInnerHTML={{ __html: ghost.html }} />
      <div className="rd-ghost-edit-actions">
        <button
          type="button"
          className="rd-ghost-btn rd-accept"
          onClick={() => {
            if (onAcceptGhostEdit) onAcceptGhostEdit();
            else toast("Ghost suggestions need a chat thread to accept.");
          }}
        >
          Accept
        </button>
        <button
          type="button"
          className="rd-ghost-btn"
          onClick={() => {
            if (onDismissGhostEdit) onDismissGhostEdit();
            else toast("Ghost suggestions need a chat thread to dismiss.");
            ToastBus.push({ message: "Suggestion dismissed" });
          }}
        >
          Reject
        </button>
        <button
          type="button"
          className="rd-ghost-btn"
          style={{ marginLeft: "auto" }}
          onClick={() => toast("Edit-first lands with the inline ghost editor in a later phase.")}
        >
          Edit first
        </button>
      </div>
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
  placeholder,
  className,
  id,
}: {
  html: string;
  ariaLabel: string;
  autoFocus?: boolean;
  onAutoFocused?: () => void;
  onCommit: (next: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const ref = React.useRef<HTMLParagraphElement>(null);
  const isEmpty = !html.replace(/<[^>]+>/g, "").trim();

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
      id={id}
      className={`rd-para-text${className ? ` ${className}` : ""}${isEmpty && placeholder ? " rd-para-empty" : ""}`}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      data-placeholder={placeholder}
      onFocus={(e) => {
        if (placeholder && !e.currentTarget.textContent?.trim()) {
          e.currentTarget.innerHTML = "";
        }
      }}
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
