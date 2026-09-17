"use client";

import * as React from "react";
import { AlertCircle, Check, ChevronDown, FileText, LoaderCircle, Send, Users } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type {
  DailyProgressBatchResult,
  DailyProgressReportChild,
  DailyProgressReportSummary,
} from "@/lib/reports/daily-progress-batch";
import { ToastBus } from "@/components/montessori/primitives";
import styles from "./daily-reports-panel.module.css";

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function reasonLabel(child: DailyProgressReportChild): string {
  if (child.reason === "sent") return "Sent today";
  if (child.reason === "in_review") return "In review";
  if (child.reason === "no_guardian") return "Family contact needed";
  if (child.reason === "no_progress") return "No progress marked";
  return `${child.guardianCount} family contact${child.guardianCount === 1 ? "" : "s"}`;
}

export function DailyReportsPanel({ refreshKey }: { refreshKey: number }) {
  const reportDate = React.useMemo(() => localDateKey(), []);
  const utcOffsetMinutes = React.useMemo(() => new Date().getTimezoneOffset(), []);
  const [open, setOpen] = React.useState(false);
  const [summary, setSummary] = React.useState<DailyProgressReportSummary | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [failures, setFailures] = React.useState<DailyProgressBatchResult[]>([]);
  const [expandedClassrooms, setExpandedClassrooms] = React.useState<Set<string>>(new Set());

  const loadSummary = React.useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/v1/reports/daily-progress?date=${encodeURIComponent(reportDate)}&utcOffsetMinutes=${utcOffsetMinutes}`,
          { credentials: "include", signal }
        );
        const payload = (await response.json().catch(() => ({}))) as
          | DailyProgressReportSummary
          | { error?: string };
        if (!response.ok || !("classrooms" in payload)) {
          throw new Error("error" in payload ? payload.error : "Couldn't load today's reports");
        }
        setSummary(payload);
        setSelected(
          new Set(
            payload.classrooms
              .flatMap((classroom) => classroom.children)
              .filter((child) => child.sendable)
              .map((child) => child.studentId)
          )
        );
        setExpandedClassrooms(
          new Set(payload.classrooms.map((classroom) => classroom.classroomId))
        );
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Couldn't load today's reports");
      } finally {
        setLoading(false);
      }
    },
    [reportDate, utcOffsetMinutes]
  );

  React.useEffect(() => {
    const controller = new AbortController();
    void loadSummary(controller.signal);
    return () => controller.abort();
  }, [loadSummary, refreshKey]);

  React.useEffect(() => {
    if (!open || summary || loading) return;
    void loadSummary();
  }, [open, summary, loading, loadSummary]);

  const allChildren = React.useMemo(
    () => summary?.classrooms.flatMap((classroom) => classroom.children) ?? [],
    [summary]
  );
  const selectedCount = selected.size;

  const toggleChild = (studentId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const toggleClassroom = (classroomId: string) => {
    setExpandedClassrooms((current) => {
      const next = new Set(current);
      if (next.has(classroomId)) next.delete(classroomId);
      else next.add(classroomId);
      return next;
    });
  };

  const toggleAllReady = () => {
    const readyIds = allChildren.filter((child) => child.sendable).map((child) => child.studentId);
    const allSelected = readyIds.length > 0 && readyIds.every((id) => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(readyIds));
  };

  const sendSelected = async () => {
    if (selectedCount === 0 || sending) return;
    setSending(true);
    setError(null);
    setFailures([]);
    try {
      const response = await fetch("/api/v1/reports/daily-progress", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportDate, utcOffsetMinutes, studentIds: [...selected] }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        sentCount?: number;
        failedCount?: number;
        results?: DailyProgressBatchResult[];
      };
      if (!response.ok) throw new Error(payload.error || "Couldn't send daily reports");
      const sentCount = payload.sentCount ?? 0;
      const failed = (payload.results ?? []).filter((result) => result.status === "failed");
      setFailures(failed);
      if (sentCount > 0) {
        ToastBus.push({
          message: `${sentCount} daily report${sentCount === 1 ? "" : "s"} sent to families`,
        });
      }
      if (failed.length > 0) {
        setError(
          `${failed.length} report${failed.length === 1 ? "" : "s"} couldn't be delivered. The others were sent.`
        );
      }
      await loadSummary();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't send daily reports");
    } finally {
      setSending(false);
    }
  };

  const readyCount = summary?.readyCount ?? 0;

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        <FileText size={15} strokeWidth={1.8} aria-hidden />
        <span>Daily reports</span>
        {!loading && readyCount > 0 ? (
          <span className={styles.triggerBadge}>{readyCount}</span>
        ) : null}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className={styles.sheet} aria-describedby="daily-reports-help">
          <SheetHeader className={styles.header}>
            <div className={styles.eyebrow}>Today · all assigned classes</div>
            <SheetTitle className={styles.title}>Daily reports</SheetTitle>
            <p id="daily-reports-help" className={styles.subtitle}>
              Review the children with progress marked today, then send their reports together.
            </p>
          </SheetHeader>

          {loading && !summary ? (
            <div className={styles.centerState}>
              <LoaderCircle className={styles.spinner} size={22} aria-hidden />
              <span>Gathering today&apos;s progress…</span>
            </div>
          ) : error && !summary ? (
            <div className={styles.centerState}>
              <AlertCircle size={22} aria-hidden />
              <span>{error}</span>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void loadSummary()}
              >
                Try again
              </button>
            </div>
          ) : summary ? (
            <>
              <div
                className={`${styles.summaryCard} ${readyCount === 0 ? styles.summaryCardQuiet : ""}`}
              >
                <div className={styles.summaryIcon}>
                  {readyCount > 0 ? (
                    <Send size={18} aria-hidden />
                  ) : (
                    <Check size={18} aria-hidden />
                  )}
                </div>
                <div>
                  <strong>
                    {readyCount > 0
                      ? `${readyCount} report${readyCount === 1 ? "" : "s"} ready`
                      : summary.sentCount > 0
                        ? "Today's reports are up to date"
                        : "Nothing ready to send yet"}
                  </strong>
                  <span>
                    {readyCount > 0
                      ? "Only children with today’s progress and a family contact are selected."
                      : summary.sentCount > 0
                        ? `${summary.sentCount} already sent to families.`
                        : "Mark progress for a child and they’ll appear here automatically."}
                  </span>
                </div>
              </div>

              {error ? (
                <div className={styles.errorBanner} role="alert">
                  <AlertCircle size={16} aria-hidden />
                  <div>
                    <strong>{error}</strong>
                    {failures.slice(0, 3).map((failure) => (
                      <span key={failure.studentId}>
                        {firstName(failure.studentName)}: {failure.error}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className={`${styles.list} scroll-quiet`}>
                {readyCount > 0 ? (
                  <button type="button" className={styles.selectAll} onClick={toggleAllReady}>
                    <span>
                      {selectedCount === readyCount ? "Clear selection" : "Select all ready"}
                    </span>
                    <span>{selectedCount} selected</span>
                  </button>
                ) : null}

                {summary.classrooms.map((classroom) => {
                  const visible = classroom.children.filter(
                    (child) => child.reason !== "no_progress"
                  );
                  const noProgressCount = classroom.children.length - visible.length;
                  const expanded = expandedClassrooms.has(classroom.classroomId);
                  if (visible.length === 0 && noProgressCount === 0) return null;
                  return (
                    <section key={classroom.classroomId} className={styles.classroom}>
                      <button
                        type="button"
                        className={styles.classroomHeader}
                        onClick={() => toggleClassroom(classroom.classroomId)}
                        aria-expanded={expanded}
                      >
                        <span>
                          <strong>{classroom.classroomName}</strong>
                          <small>
                            {visible.length} with activity
                            {noProgressCount > 0 ? ` · ${noProgressCount} not included` : ""}
                          </small>
                        </span>
                        <ChevronDown
                          size={17}
                          aria-hidden
                          style={{ transform: expanded ? "rotate(180deg)" : undefined }}
                        />
                      </button>
                      {expanded ? (
                        <div className={styles.children}>
                          {visible.map((child) => {
                            const checked = selected.has(child.studentId);
                            return (
                              <label
                                key={child.studentId}
                                className={`${styles.childRow} ${child.sendable ? "" : styles.childRowDisabled}`}
                              >
                                <input
                                  className={styles.nativeCheckbox}
                                  type="checkbox"
                                  checked={checked}
                                  disabled={!child.sendable || sending}
                                  onChange={() => toggleChild(child.studentId)}
                                />
                                <span
                                  className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ""}`}
                                  aria-hidden
                                >
                                  {checked ? <Check size={13} strokeWidth={2.5} /> : null}
                                </span>
                                <span className={styles.avatar}>{initials(child.studentName)}</span>
                                <span className={styles.childCopy}>
                                  <strong>{child.studentName}</strong>
                                  <small>
                                    {child.progressCount} progress mark
                                    {child.progressCount === 1 ? "" : "s"}
                                    {child.noteCount > 0
                                      ? ` · ${child.noteCount} note${child.noteCount === 1 ? "" : "s"}`
                                      : ""}
                                  </small>
                                </span>
                                <span
                                  className={`${styles.rowStatus} ${styles[`status_${child.reason}`]}`}
                                >
                                  {child.reason === "sent" ? <Check size={12} aria-hidden /> : null}
                                  {reasonLabel(child)}
                                </span>
                              </label>
                            );
                          })}
                          {noProgressCount > 0 ? (
                            <div className={styles.notIncluded}>
                              <Users size={14} aria-hidden />
                              {noProgressCount}{" "}
                              {noProgressCount === 1 ? "child has" : "children have"} no progress
                              marked today
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>

              <footer className={styles.footer}>
                <div className={styles.footerCopy}>
                  <strong>
                    {selectedCount > 0 ? `${selectedCount} selected` : "No reports selected"}
                  </strong>
                  <span>Families receive their child&apos;s report by email.</span>
                </div>
                <button
                  type="button"
                  className={styles.sendButton}
                  disabled={selectedCount === 0 || sending}
                  onClick={() => void sendSelected()}
                >
                  {sending ? (
                    <LoaderCircle className={styles.spinner} size={16} />
                  ) : (
                    <Send size={15} />
                  )}
                  {sending
                    ? "Preparing reports…"
                    : `Send ${selectedCount || ""} report${selectedCount === 1 ? "" : "s"}`}
                </button>
              </footer>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
