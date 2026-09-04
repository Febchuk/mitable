import {
  ToddlerRoutineIllustration,
  type ToddlerRoutineIllustrationKind,
} from "./toddler-routine-illustration";
import styles from "./toddler-daily-log-summary.module.css";

type SummaryItem = {
  label: string;
  value: string;
  details: string[];
  illustration: ToddlerRoutineIllustrationKind;
};

const ILLUSTRATION_FOR_LABEL: Array<[string, ToddlerRoutineIllustrationKind]> = [
  ["mood", "mood"],
  ["nap", "nap"],
  ["class participation", "participation"],
  ["attendance", "participation"],
  ["potty", "toileting"],
  ["feeding", "feeding"],
  ["outdoor", "outdoor"],
  ["activities", "activities"],
  ["montessori materials", "materials"],
  ["other notes", "notes"],
  ["teacher comments", "notes"],
];

function illustrationFor(label: string): ToddlerRoutineIllustrationKind {
  const normalized = label.toLowerCase();
  return ILLUSTRATION_FOR_LABEL.find(([prefix]) => normalized.startsWith(prefix))?.[1] ?? "notes";
}

export function parseToddlerDailyLogSummary(text: string): SummaryItem[] {
  const items: SummaryItem[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("•")) {
      items.at(-1)?.details.push(line.replace(/^•\s*/, ""));
      continue;
    }
    const separator = line.indexOf(":");
    const label = separator >= 0 ? line.slice(0, separator).trim() : line;
    const value = separator >= 0 ? line.slice(separator + 1).trim() : "";
    items.push({ label, value, details: [], illustration: illustrationFor(label) });
  }
  return items;
}

export function ToddlerDailyLogSummary({ text }: { text: string }) {
  const items = parseToddlerDailyLogSummary(text);
  return (
    <div className={styles.grid} data-toddler-daily-log-summary>
      {items.map((item, index) => {
        const wide = item.label === "Other notes" || item.label === "Teacher comments";
        return (
          <div
            className={`${styles.card}${wide ? ` ${styles.wide}` : ""}`}
            key={`${item.label}-${index}`}
          >
            <ToddlerRoutineIllustration kind={item.illustration} small />
            <div>
              <p className={styles.label}>{item.label}</p>
              <p className={styles.value}>
                {item.value || (item.details.length ? "Recorded" : "Not recorded")}
              </p>
              {item.details.length ? (
                <ul className={styles.details}>
                  {item.details.map((detail, detailIndex) => (
                    <li key={`${detail}-${detailIndex}`}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
