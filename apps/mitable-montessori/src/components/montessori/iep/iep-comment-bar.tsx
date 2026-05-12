"use client";

import * as React from "react";
import progress from "@/components/montessori/progress/progress.module.css";
import {
  IEP_PROGRESS_BG,
  IEP_PROGRESS_FG,
  IEP_PROGRESS_LABEL,
  IEP_PROGRESS_VALUES,
  PROMPTING_CODES,
  PROMPTING_LABEL,
  type IepGoal,
  type IepItemState,
  type IepProgress,
  type PromptingCode,
} from "./data";
import styles from "./iep.module.css";

export type IepCommentBarApply = {
  progress: IepProgress | null;
  accuracy: number | null;
  prompting: PromptingCode | null;
  comment: string;
};

export type IepCommentBarProps = {
  goal: IepGoal;
  studentName: string;
  state: IepItemState;
  onApply: (next: IepCommentBarApply) => void;
  onCancel: () => void;
};

/** Black bottom comment bar for IEP items. Layout: actions stacked on the
 *  LEFT (Apply on top, Cancel below); option clusters stacked vertically on
 *  the right — Progress, Accuracy, Prompting, Comment. Every chip click is
 *  a draft change; Apply commits all fields at once. */
export function IepCommentBar({ goal, studentName, state, onApply, onCancel }: IepCommentBarProps) {
  const [prog, setProg] = React.useState<IepProgress | null>(state.progress);
  const [accuracy, setAccuracy] = React.useState<number | null>(state.accuracy);
  const [prompt, setPrompt] = React.useState<PromptingCode | null>(state.prompting);
  const [comment, setComment] = React.useState("");
  const [accuracyInput, setAccuracyInput] = React.useState(
    state.accuracy !== null ? String(state.accuracy) : ""
  );

  React.useEffect(() => {
    setProg(state.progress);
    setAccuracy(state.accuracy);
    setAccuracyInput(state.accuracy !== null ? String(state.accuracy) : "");
    setPrompt(state.prompting);
    setComment("");
  }, [goal.id, state.progress, state.accuracy, state.prompting]);

  const dirty =
    prog !== state.progress ||
    accuracy !== state.accuracy ||
    prompt !== state.prompting ||
    comment.trim().length > 0;

  const apply = React.useCallback(() => {
    if (!dirty) {
      onCancel();
      return;
    }
    onApply({ progress: prog, accuracy, prompting: prompt, comment: comment.trim() });
  }, [dirty, prog, accuracy, prompt, comment, onApply, onCancel]);

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

  const onAccuracyChange = (raw: string) => {
    setAccuracyInput(raw);
    const n = parseInt(raw, 10);
    if (raw === "" || raw === "-") {
      setAccuracy(null);
    } else if (!isNaN(n) && n >= 0 && n <= 100) {
      setAccuracy(n);
    }
  };

  return (
    <div
      className={`${progress.bulkBar} ${styles.commentBar}`}
      role="dialog"
      aria-label={`Edit IEP item · ${goal.name}`}
    >
      <div className={styles.barHeader}>
        <div className={styles.barOverline}>
          {studentName} · {goal.domain}
        </div>
        <div className={styles.barTitle} title={goal.name}>
          {goal.name}
        </div>
      </div>

      <div className={styles.barLayout}>
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

        <div className={styles.barClusters}>
          <Cluster label="Progress" hint={prog !== null ? IEP_PROGRESS_LABEL[prog] : "Pick one"}>
            <div className={styles.barChipRow}>
              {IEP_PROGRESS_VALUES.map((p) => {
                const active = prog === p;
                return (
                  <button
                    key={p}
                    type="button"
                    className={`${styles.barChip} tap`}
                    data-active={active ? "true" : "false"}
                    onClick={() => setProg(p)}
                    aria-label={IEP_PROGRESS_LABEL[p]}
                    title={IEP_PROGRESS_LABEL[p]}
                    style={{
                      background: active ? IEP_PROGRESS_BG[p] : "rgba(255,251,243,0.1)",
                      color: active ? IEP_PROGRESS_FG[p] : "rgba(255,251,243,0.92)",
                      borderColor: active ? "rgba(255,251,243,0.55)" : "transparent",
                    }}
                  >
                    <span className={styles.barChipKey}>{p}</span>
                    <span className={styles.barChipHint}>{IEP_PROGRESS_LABEL[p]}</span>
                  </button>
                );
              })}
            </div>
          </Cluster>

          <Cluster label="Accuracy" hint={accuracy !== null ? `${accuracy}%` : "0–100 %"}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                min={0}
                max={100}
                value={accuracyInput}
                onChange={(e) => onAccuracyChange(e.target.value)}
                placeholder="0–100"
                style={{
                  width: 72,
                  padding: "5px 8px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,251,243,0.25)",
                  background: "rgba(255,251,243,0.08)",
                  color: "rgba(255,251,243,0.92)",
                  fontSize: 14,
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
              <span style={{ fontSize: 13, color: "rgba(255,251,243,0.55)" }}>%</span>
            </div>
          </Cluster>

          <Cluster label="Prompting" hint={prompt ? PROMPTING_LABEL[prompt] : "Pick level"}>
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
              placeholder="What stood out today?"
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
