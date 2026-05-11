"use client";

import * as React from "react";
import { MessageSquare } from "lucide-react";
import { PROMPTING_LABEL, type IepItemState, type IepGoal } from "./data";
import styles from "./iep.module.css";

export type IepItemRowProps = {
  goal: IepGoal;
  state: IepItemState;
  selected: boolean;
  onSelect: () => void;
};

/** A single IEP item row — one student × one goal. Shows the 3 standard
 *  fields inline as verbatim "field: value" chips (rating, completion,
 *  prompt). Tapping the row opens the black comment bar
 *  (see iep-comment-bar.tsx). */
export function IepItemRow({ goal, state, selected, onSelect }: IepItemRowProps) {
  const ratingValue = state.rating !== null ? String(state.rating) : "—";
  const completionValue = state.successCount !== null ? `${state.successCount}/10` : "—/10";
  const promptValue = state.promptingCode
    ? PROMPTING_LABEL[state.promptingCode].toLowerCase()
    : "—";
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
        <FieldChip name="rating" value={ratingValue} />
        <FieldChip name="completion" value={completionValue} />
        <FieldChip name="prompt" value={promptValue} />
      </div>
    </button>
  );
}

function FieldChip({ name, value }: { name: string; value: string }) {
  return (
    <span className={styles.fieldChip}>
      <span className={styles.fieldLabel}>{name}:</span>
      {value}
    </span>
  );
}
