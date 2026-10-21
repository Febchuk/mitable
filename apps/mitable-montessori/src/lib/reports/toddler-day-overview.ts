import type { ToddlerDailyLog } from "@/lib/toddler-routines";
import type { ProgressTopicRow } from "./progress-topic-payload";
import { STATUS_LABEL, statusToMark } from "@/lib/progress/marking-schemas";

/** A factual synthesis of both saved sources; never infer an unrecorded event. */
export function toddlerDayOverview(
  log: ToddlerDailyLog | null,
  progress: ProgressTopicRow[]
): string {
  const sentences: string[] = [];
  if (log) {
    const care = [
      ["mood", log.mood],
      ["nap", log.nap],
      ["class participation", log.participation],
    ]
      .filter(([, value]) => value)
      .map(([label, value]) => `${label}: ${value}`);
    if (care.length) sentences.push(`The daily care record includes ${care.join("; ")}.`);
    if (log.activityLabels.length)
      sentences.push(`Activities included ${log.activityLabels.join(", ")}.`);
    if (log.materialLabels.length)
      sentences.push(`Montessori materials included ${log.materialLabels.join(", ")}.`);
  } else {
    sentences.push("No Daily Log was recorded for this date.");
  }
  if (progress.length) {
    sentences.push(
      `Classroom learning: ${progress
        .map((row) => `${row.name} (${STATUS_LABEL[statusToMark(row.status)]})`)
        .join("; ")}.`
    );
    for (const row of progress) {
      if (row.comment?.trim()) sentences.push(`${row.name} — ${row.comment}`);
    }
  } else {
    sentences.push("No curriculum progress was marked for this date.");
  }
  if (log?.otherNotes.trim()) sentences.push(log.otherNotes);
  if (log?.teacherComments.trim()) sentences.push(log.teacherComments);
  return sentences.join("\n\n");
}
