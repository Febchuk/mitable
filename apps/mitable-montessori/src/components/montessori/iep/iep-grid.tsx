"use client";

import * as React from "react";
import { MessageSquare } from "lucide-react";
import {
  PROMPTING_LABEL,
  RATING_BG,
  RATING_FG,
  RATING_LABEL,
  type IepItemState,
  type IepGoal,
} from "./data";
import styles from "./iep.module.css";

export type IepItemRowProps = {
  goal: IepGoal;
  state: IepItemState;
  selected: boolean;
  onSelect: () => void;
};

/** A single IEP item row — one student × one goal. Shows the 3 standard
 *  fields inline (rating chip, completion x/10, prompting). Tapping the row
 *  opens the black comment bar (see iep-comment-bar.tsx). */
export function IepItemRow({ goal, state, selected, onSelect }: IepItemRowProps) {
  const ratingLabel =
    state.rating !== null ? `${state.rating} · ${RATING_LABEL[state.rating]}` : "Not yet rated";
  const ratingBg = state.rating !== null ? RATING_BG[state.rating] : "var(--color-muted)";
  const ratingFg = state.rating !== null ? RATING_FG[state.rating] : "var(--color-ink-muted)";
  const completionLabel = state.successCount !== null ? `${state.successCount}/10` : "—/10";
  const promptLabel = state.promptingCode ? PROMPTING_LABEL[state.promptingCode] : "—";
  const commentCount = state.comments.length;

  return (
    <button
      type="button"
      className={`${styles.itemRow} tap`}
      data-selected={selected ? "true" : "false"}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className={styles.itemMain}>
        <div className={styles.itemName} title={goal.name}>
          {goal.name}
        </div>
        {commentCount > 0 && (
          <div className={styles.itemMeta}>
            <MessageSquare size={11} strokeWidth={1.6} />
            {commentCount} {commentCount === 1 ? "comment" : "comments"}
          </div>
        )}
      </div>
      <div className={styles.itemFields}>
        <span
          className={styles.ratingPill}
          style={{ background: ratingBg, color: ratingFg }}
          aria-label={`Rating ${ratingLabel}`}
          title={`Rating · ${ratingLabel}`}
        >
          {state.rating !== null ? state.rating : "—"}
          <span className={styles.ratingPillSub}>
            {state.rating !== null ? RATING_LABEL[state.rating] : "Rate"}
          </span>
        </span>
        <span className={styles.fieldChip} title="Completion rate">
          <span className={styles.fieldLabel}>Compl</span>
          {completionLabel}
        </span>
        <span className={styles.fieldChip} title="Prompting">
          <span className={styles.fieldLabel}>Prompt</span>
          {state.promptingCode ?? "—"}
          {state.promptingCode && <span className={styles.fieldHintInline}>{promptLabel}</span>}
        </span>
      </div>
    </button>
  );
}
