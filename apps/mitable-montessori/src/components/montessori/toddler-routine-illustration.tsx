import styles from "./toddler-routine-illustration.module.css";

export type ToddlerRoutineIllustrationKind =
  | "mood"
  | "nap"
  | "participation"
  | "toileting"
  | "feeding"
  | "outdoor"
  | "activities"
  | "materials"
  | "notes";

export function ToddlerRoutineIllustration({
  kind,
  small = false,
}: {
  kind: ToddlerRoutineIllustrationKind;
  small?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.illustration} ${styles[kind]}${small ? ` ${styles.small}` : ""}`}
      data-toddler-illustration={kind}
    />
  );
}
