"use client";

import * as React from "react";
import progress from "@/components/montessori/progress/progress.module.css";
import {
  PROMPTING_CODES,
  PROMPTING_LABEL,
  RATING_BG,
  RATING_FG,
  RATING_LABEL,
  RATINGS,
  type IepItemState,
  type IepGoal,
  type IepRating,
  type PromptingCode,
} from "./data";
import styles from "./iep.module.css";

const COUNTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type IepCommentBarApply = {
  rating: IepRating | null;
  successCount: number | null;
  promptingCode: PromptingCode | null;
  comment: string;
};

export type IepCommentBarProps = {
  goal: IepGoal;
  studentName: string;
  state: IepItemState;
  onApply: (next: IepCommentBarApply) => void;
  onCancel: () => void;
};

/** Black bottom comment bar for IEP items. Reuses `progress.module.css ::
 *  .bulkBar` so it matches the Montessori comment-entry visual exactly,
 *  with IEP-specific controls slotted in.
 *
 *  Layout: actions stacked on the LEFT (Apply on top, Cancel below); option
 *  clusters stacked vertically on the right with equal spacing — Rating,
 *  Completion, Prompting, Comment. Every chip click is a draft change;
 *  Apply commits all four fields at once. */
export function IepCommentBar({ goal, studentName, state, onApply, onCancel }: IepCommentBarProps) {
  // Draft state — committed only on Apply.
  const [rating, setRating] = React.useState<IepRating | null>(state.rating);
  const [count, setCount] = React.useState<number | null>(state.successCount);
  const [prompt, setPrompt] = React.useState<PromptingCode | null>(state.promptingCode);
  const [comment, setComment] = React.useState("");

  // Re-seed the draft each time the bar mounts on a different item.
  React.useEffect(() => {
    setRating(state.rating);
    setCount(state.successCount);
    setPrompt(state.promptingCode);
    setComment("");
  }, [goal.id, state.rating, state.successCount, state.promptingCode]);

  const dirty =
    rating !== state.rating ||
    count !== state.successCount ||
    prompt !== state.promptingCode ||
    comment.trim().length > 0;

  const apply = React.useCallback(() => {
    if (!dirty) {
      onCancel();
      return;
    }
    onApply({ rating, successCount: count, promptingCode: prompt, comment: comment.trim() });
  }, [dirty, rating, count, prompt, comment, onApply, onCancel]);

  // Cmd/Ctrl-Enter applies; Esc cancels.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        apply();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, onCancel]);

  return (
    <div
      className={`${progress.bulkBar} ${styles.commentBar}`}
      role="dialog"
      aria-label={`Edit IEP item · ${goal.name}`}
    >
      {/* header: student + goal, no actions here — actions live in the left column */}
      <div className={styles.barHeader}>
        <div className={styles.barOverline}>
          {studentName} · {goal.domain}
        </div>
        <div className={styles.barTitle} title={goal.name}>
          {goal.name}
        </div>
      </div>

      <div className={styles.barLayout}>
        {/* LEFT: stacked action buttons */}
        <div className={styles.barActions}>
          <button
            type="button"
            className={`${progress.primaryLight} tap ${styles.barActionBtn}`}
            onClick={apply}
            disabled={!dirty}
          >
            Apply
          </button>
          <button
            type="button"
            className={`${progress.ghostBtn} tap ${styles.barActionBtn}`}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>

        {/* RIGHT: option clusters stacked vertically with equal spacing */}
        <div className={styles.barClusters}>
          <Cluster label="Rating" hint={rating !== null ? RATING_LABEL[rating] : "Pick 1–5"}>
            <div className={styles.barChipRow}>
              {RATINGS.map((r) => {
                const active = rating === r;
                return (
                  <button
                    key={r}
                    type="button"
                    className={`${styles.barChip} tap`}
                    data-active={active ? "true" : "false"}
                    onClick={() => setRating(r)}
                    aria-label={`${r} — ${RATING_LABEL[r]}`}
                    title={RATING_LABEL[r]}
                    style={{
                      background: active ? RATING_BG[r] : "rgba(255,251,243,0.1)",
                      color: active ? RATING_FG[r] : "rgba(255,251,243,0.92)",
                      borderColor: active ? "rgba(255,251,243,0.55)" : "transparent",
                    }}
                  >
                    <span className={styles.barChipKey}>{r}</span>
                    <span className={styles.barChipHint}>{RATING_LABEL[r]}</span>
                  </button>
                );
              })}
            </div>
          </Cluster>

          <Cluster label="Completion" hint={count !== null ? `${count} / 10` : "Pick a count"}>
            <div className={styles.barCountRow}>
              {COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`${styles.barCountBtn} tap`}
                  data-active={count === n ? "true" : "false"}
                  onClick={() => setCount(n)}
                  aria-label={`${n} of 10`}
                >
                  {n}
                </button>
              ))}
            </div>
          </Cluster>

          <Cluster
            label="Prompting"
            hint={prompt ? PROMPTING_LABEL[prompt] : "Single primary value"}
          >
            <div className={styles.barChipRow}>
              {PROMPTING_CODES.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`${styles.barChip} tap`}
                  data-active={prompt === p ? "true" : "false"}
                  onClick={() => setPrompt(p)}
                  aria-label={`${p} — ${PROMPTING_LABEL[p]}`}
                  title={PROMPTING_LABEL[p]}
                >
                  <span className={styles.barChipKey}>{p}</span>
                  <span className={styles.barChipHint}>{PROMPTING_LABEL[p]}</span>
                </button>
              ))}
            </div>
          </Cluster>

          <Cluster label="Comment" hint="Saved with this Apply · ⌘↵">
            <textarea
              placeholder="What stood out today? Threads to the comments drawer on the right."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
            />
          </Cluster>
        </div>
      </div>
    </div>
  );
}

function Cluster({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.barCluster}>
      <div className={styles.barClusterHead}>
        <div className={styles.barClusterLabel}>{label}</div>
        {hint && <div className={styles.barClusterHint}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}
