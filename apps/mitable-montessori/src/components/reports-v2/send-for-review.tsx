"use client";

import { useEffect, useState } from "react";
import type { MockReport } from "./mock-data";
import { Icon } from "./icons";
import styles from "./reports-v2.module.css";

type Reviewer = {
  initials: string;
  name: string;
  role: string;
  tone: "clay" | "sage" | "butter" | "blue";
};

const AVAILABLE_REVIEWERS: Reviewer[] = [
  { initials: "MW", name: "Mei Wong", role: "Lead · Bluebell room", tone: "sage" },
  { initials: "DR", name: "Diego Ruiz", role: "Assistant · Bluebell", tone: "clay" },
  { initials: "JT", name: "Jamie Tao", role: "Lead · Robin room", tone: "butter" },
  { initials: "RS", name: "Rita Singh", role: "Floater", tone: "blue" },
];

const TONE_CLASS: Record<Reviewer["tone"], string> = {
  clay: styles.avClay,
  sage: styles.avSage,
  butter: styles.avButter,
  blue: styles.avBlue,
};

function scoreClass(score: number) {
  if (score >= 85) return styles.scoreGreen;
  if (score >= 60) return styles.scoreAmber;
  return styles.scoreRed;
}

/** Shared form body for both web drawer + mobile sheet. */
function SendForReviewForm({ report }: { report: MockReport }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(["MW", "DR"]));
  const toggle = (initials: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(initials)) next.delete(initials);
      else next.add(initials);
      return next;
    });
  };
  return (
    <>
      <div className={styles.aiCallout}>
        <div className={styles.aiRow}>
          <span className={`${styles.score} ${scoreClass(report.aiScore)}`}>
            <span className={styles.scoreBubble}>{report.aiScore}</span>
            {report.aiScore >= 85
              ? "Reviewers likely to fast-approve"
              : "Reviewers will want a closer look"}
          </span>
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "var(--color-ink-secondary)",
            lineHeight: 1.5,
          }}
        >
          Above 85 = high-confidence. Most green-scored reports are approved without re-reading.
        </div>
      </div>

      <div>
        <label className={styles.fieldLabel}>Assign reviewers · pick 1–3</label>
        <div className={styles.reviewerGrid}>
          {AVAILABLE_REVIEWERS.map((r) => (
            <button
              key={r.initials}
              type="button"
              className={`${styles.reviewerCard} ${
                selected.has(r.initials) ? styles.reviewerCardSelected : ""
              }`}
              onClick={() => toggle(r.initials)}
            >
              <div className={`${styles.av} ${styles.avSm} ${TONE_CLASS[r.tone]}`}>
                {r.initials}
              </div>
              <div className={styles.info}>
                <span className={styles.nm}>{r.name}</span>
                <span className={styles.role}>{r.role}</span>
              </div>
              <div className={styles.reviewerCheck}>
                <Icon.Check size={11} />
              </div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 9, fontSize: 11.5, color: "var(--color-ink-muted)" }}>
          Parallel review — any of them can tick first.
        </div>
      </div>

      <div>
        <label className={styles.fieldLabel}>Note for reviewers · optional</label>
        <textarea
          className={styles.note}
          defaultValue="Self-correction moment — wanted a second pair of eyes on whether to call it Major or Daily."
        />
      </div>
    </>
  );
}

/** Web right-side drawer. Positioned inside the reading pane (absolute). */
export function SendForReviewDrawer({
  report,
  onClose,
}: {
  report: MockReport;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className={styles.drawerScrim} onClick={onClose} aria-hidden />
      <aside className={styles.drawer} aria-label="Send for review">
        <div className={styles.drawerHead}>
          <div>
            <h3>Send for review</h3>
            <div className={styles.sub}>
              {report.title} · {report.childName}
            </div>
          </div>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            style={{ padding: "6px 8px", borderRadius: 8 }}
            onClick={onClose}
            aria-label="Close"
          >
            <Icon.Close size={14} />
          </button>
        </div>
        <div className={styles.drawerBody}>
          <SendForReviewForm report={report} />
        </div>
        <div className={styles.drawerFoot}>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onClose}>
            Save draft
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`}>
            <Icon.Send size={13} /> Send to 2 reviewers
          </button>
        </div>
      </aside>
    </>
  );
}

/** Mobile bottom sheet (70vh). Fixed to viewport. */
export function SendForReviewMobileSheet({
  report,
  onClose,
}: {
  report: MockReport;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className={styles.sheetScrim} onClick={onClose} aria-hidden />
      <div className={styles.sheet} role="dialog" aria-label="Send for review">
        <div className={styles.sheetHandle} />
        <div className={styles.sheetHead}>
          <div>
            <h3>Send for review</h3>
            <div className={styles.sub}>
              {report.title} · {report.childName}
            </div>
          </div>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            style={{ padding: "6px 8px", borderRadius: 8 }}
            onClick={onClose}
            aria-label="Close"
          >
            <Icon.Close size={14} />
          </button>
        </div>
        <div className={styles.sheetBody}>
          <SendForReviewForm report={report} />
        </div>
        <div className={styles.sheetFoot}>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onClose}>
            Save draft
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`}>
            <Icon.Send size={13} /> Send to 2
          </button>
        </div>
      </div>
    </>
  );
}
