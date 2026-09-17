"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildSchemeSubjects,
  cleanSchemeName,
  readSchemeCsv,
  type SchemeColumn,
  type SchemeDraftTopic,
  type SchemePreview,
} from "@/lib/admin/scheme-import";

type ImportResult = { subjectsAdded: number; topicsAdded: number; lessonsAdded: number };

export function SchemeImportDialog({
  open,
  onOpenChange,
  curriculumId,
  curriculumName,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  curriculumId: string;
  curriculumName: string;
  onImported: (result: ImportResult) => void;
}) {
  const [fileName, setFileName] = React.useState("");
  const [columns, setColumns] = React.useState<SchemeColumn[]>([]);
  const [names, setNames] = React.useState<Record<number, string>>({});
  const [topics, setTopics] = React.useState<SchemeDraftTopic[]>([]);
  const [warning, setWarning] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<SchemePreview | null>(null);
  const [signature, setSignature] = React.useState("");
  const [payload, setPayload] = React.useState<ReturnType<typeof buildSchemeSubjects>>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const reset = () => {
    setFileName("");
    setColumns([]);
    setNames({});
    setTopics([]);
    setWarning(null);
    setPreview(null);
    setSignature("");
    setPayload([]);
    setError("");
  };

  React.useEffect(() => {
    reset();
  }, [curriculumId]);

  const readFile = async (file: File) => {
    reset();
    setFileName(file.name);
    if (file.size > 1_000_000) {
      setError("Choose a CSV smaller than 1 MB.");
      return;
    }
    try {
      const parsed = readSchemeCsv(await file.text());
      setColumns(parsed.columns);
      setNames(
        Object.fromEntries(parsed.columns.map((column) => [column.index, column.suggestedName]))
      );
      setTopics(parsed.topics);
      setWarning(parsed.warning);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read the CSV.");
    }
  };

  const updateTopic = (id: string, change: Partial<SchemeDraftTopic>) => {
    setTopics((current) =>
      current.map((topic) => (topic.id === id ? { ...topic, ...change } : topic))
    );
    setPreview(null);
    setError("");
  };

  const review = async () => {
    setError("");
    let nextPayload: ReturnType<typeof buildSchemeSubjects>;
    try {
      nextPayload = buildSchemeSubjects(columns, topics, names);
      if (!nextPayload.length) throw new Error("Include at least one topic in a named subject.");
      if (nextPayload.reduce((sum, subject) => sum + subject.topics.length, 0) > 500) {
        throw new Error("An import can contain at most 500 topics.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Check your topics.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/curricula/import-scheme", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ curriculum_id: curriculumId, subjects: nextPayload, dry_run: true }),
      });
      const data = (await response.json()) as {
        error?: string;
        preview?: SchemePreview;
        signature?: string;
      };
      if (!response.ok || !data.preview || !data.signature)
        throw new Error(data.error ?? "Could not prepare preview.");
      setPayload(nextPayload);
      setPreview(data.preview);
      setSignature(data.signature);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare preview.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!preview || !signature) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/curricula/import-scheme", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          curriculum_id: curriculumId,
          subjects: payload,
          dry_run: false,
          preview_signature: signature,
        }),
      });
      const data = (await response.json()) as { error?: string; result?: ImportResult };
      if (!response.ok || !data.result) {
        if (response.status === 409) setPreview(null);
        throw new Error(data.error ?? "Could not import scheme.");
      }
      onImported(data.result);
      onOpenChange(false);
      reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import scheme.");
    } finally {
      setBusy(false);
    }
  };

  const skipped = topics.filter(
    (topic) => !topic.included || !cleanSchemeName(names[topic.columnIndex] ?? "")
  ).length;
  const repeats = topics.reduce((sum, topic) => sum + topic.rows.length - 1, 0);
  const possibleDuplicates = payload.flatMap((subject) => {
    const variations = new Map<string, string[]>();
    subject.topics.forEach((topic) => {
      const looseKey = topic.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      if (looseKey) variations.set(looseKey, [...(variations.get(looseKey) ?? []), topic]);
    });
    return [...variations.values()]
      .filter((names) => names.length > 1)
      .map((names) => `${subject.name}: ${names.join(" / ")}`);
  });
  const weeksFor = (subjectName: string, topicName: string) => {
    const weeks = new Set<string>();
    topics.forEach((topic) => {
      if (
        topic.included &&
        cleanSchemeName(names[topic.columnIndex] ?? "").toLowerCase() ===
          subjectName.toLowerCase() &&
        cleanSchemeName(topic.name).toLowerCase() === topicName.toLowerCase()
      ) {
        topic.weeks.forEach((week) => weeks.add(week));
      }
    });
    return [...weeks].join(", ");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          onOpenChange(next);
          if (!next) reset();
        }
      }}
    >
      <DialogContent className="flex max-h-[86vh] max-w-[940px] flex-col overflow-hidden rounded-[22px] border border-border bg-surface p-0 shadow-2xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
          <DialogTitle className="text-xl">Import scheme into {curriculumName}</DialogTitle>
          <p className="text-sm text-ink-secondary">
            Check the columns and every subject, topic, and matching lesson before saving.
          </p>
        </DialogHeader>
        <div className="scroll-quiet min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {!columns.length ? (
            <div className="rounded-2xl border border-border bg-canvas p-5">
              <label className="inline-flex cursor-pointer items-center rounded-md border border-ink/15 bg-surface px-4 py-2 text-sm font-medium hover:bg-muted">
                Choose scheme CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void readFile(file);
                    event.target.value = "";
                  }}
                />
              </label>
              <p className="mt-3 text-sm text-ink-secondary">
                Use a CSV with a WEEK column and subject headings. Each filled cell becomes a topic
                with one same-named lesson.
              </p>
            </div>
          ) : preview ? (
            <>
              <div className="rounded-xl border border-border bg-canvas p-4 text-sm">
                <strong>Ready to add:</strong> {preview.counts.subjects} subjects,{" "}
                {preview.counts.topics} topics, {preview.counts.lessons} lessons.
                {preview.counts.reusedTopics > 0
                  ? ` ${preview.counts.reusedTopics} existing topics will be reused.`
                  : ""}
                {` ${skipped} scheme entries excluded; ${repeats} repeated cells collapsed.`}
              </div>
              {possibleDuplicates.length ? (
                <div className="rounded-xl border border-terracotta/30 bg-terracotta/10 p-4 text-sm">
                  <strong>Check similar names:</strong> {possibleDuplicates.join("; ")}. Go back to
                  edit if these should be one topic.
                </div>
              ) : null}
              {preview.subjects.map((subject) => (
                <section
                  key={subject.name}
                  className="rounded-xl border border-border bg-surface p-4"
                >
                  <h3 className="font-semibold">
                    {subject.name}{" "}
                    <span className="text-xs font-normal text-ink-muted">
                      {subject.action === "add" ? "New subject" : "Existing subject"}
                    </span>
                  </h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {subject.topics.map((topic) => (
                      <li key={topic.name} className="border-t border-border pt-2">
                        <span className="font-medium">{topic.name}</span>
                        <span className="ml-2 text-ink-secondary">
                          Topic: {topic.action === "add" ? "add" : "reuse"} · Lesson “{topic.name}”:{" "}
                          {topic.lessonAction === "add" ? "add" : "reuse"}
                        </span>
                        {weeksFor(subject.name, topic.name) ? (
                          <div className="text-xs text-ink-muted">
                            Weeks: {weeksFor(subject.name, topic.name)}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {topics.some(
                (topic) => !topic.included || !cleanSchemeName(names[topic.columnIndex] ?? "")
              ) ? (
                <section className="rounded-xl border border-border bg-canvas p-4 text-sm">
                  <h3 className="font-semibold">Entries that will not be imported</h3>
                  <ul className="mt-2 list-inside list-disc text-ink-secondary">
                    {topics
                      .filter(
                        (topic) =>
                          !topic.included || !cleanSchemeName(names[topic.columnIndex] ?? "")
                      )
                      .map((topic) => (
                        <li key={topic.id}>
                          {topic.name} · week {topic.weeks.join(", ")}
                        </li>
                      ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : (
            <>
              <div className="text-sm text-ink-secondary">
                {fileName} · {topics.length} distinct entries · {repeats} repeated cells collapsed
              </div>
              {warning ? (
                <p className="rounded-xl border border-terracotta/30 bg-terracotta/10 p-3 text-sm">
                  {warning}
                </p>
              ) : null}
              <section>
                <h3 className="font-semibold">1. Check the subject columns</h3>
                <p className="mb-3 text-sm text-ink-secondary">
                  The suggested headings may be shifted. Clear a name to ignore that column.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {columns.map((column) => (
                    <label
                      key={column.index}
                      className="rounded-xl border border-border bg-canvas p-3 text-sm"
                    >
                      <span className="block font-medium">
                        Column {column.index + 1} · {column.samples.slice(0, 2).join(" / ")}
                      </span>
                      <span className="mt-1 block text-xs text-ink-muted">Subject name</span>
                      <Input
                        value={names[column.index] ?? ""}
                        onChange={(event) => {
                          setNames((current) => ({
                            ...current,
                            [column.index]: event.target.value,
                          }));
                          setError("");
                        }}
                        className="mt-1 bg-surface"
                      />
                    </label>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="font-semibold">2. Check topics</h3>
                <p className="mb-3 text-sm text-ink-secondary">
                  Untick breaks or revision rows you do not want. Commas within a cell stay in one
                  topic.
                </p>
                <div className="space-y-4">
                  {columns.map((column) => (
                    <div key={column.index} className="rounded-xl border border-border p-3">
                      <h4 className="mb-2 text-sm font-semibold">
                        {names[column.index] || `Ignored column ${column.index + 1}`}
                      </h4>
                      <div className="space-y-2">
                        {topics
                          .filter((topic) => topic.columnIndex === column.index)
                          .map((topic) => (
                            <div key={topic.id} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                aria-label={`Include ${topic.name}`}
                                checked={topic.included}
                                onChange={(event) =>
                                  updateTopic(topic.id, { included: event.target.checked })
                                }
                              />
                              <Input
                                aria-label={`Topic from week ${topic.weeks.join(", ")}`}
                                value={topic.name}
                                onChange={(event) =>
                                  updateTopic(topic.id, { name: event.target.value })
                                }
                                className="min-w-0 flex-1 bg-canvas"
                              />
                              <span
                                className="w-24 shrink-0 text-right text-xs text-ink-muted"
                                title={`Rows ${topic.rows.join(", ")}`}
                              >
                                Week {topic.weeks.join(", ")}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-terracotta/30 bg-terracotta/10 p-3 text-sm"
            >
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 justify-between border-t border-border px-6 py-4">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (preview) {
                setPreview(null);
                setError("");
              } else if (columns.length) {
                reset();
              } else {
                onOpenChange(false);
              }
            }}
          >
            {preview ? "Back to edit" : columns.length ? "Use a different file" : "Cancel"}
          </Button>
          {columns.length ? (
            <Button disabled={busy} onClick={() => void (preview ? save() : review())}>
              {busy ? "Working…" : preview ? "Confirm and import" : "Review import"}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
