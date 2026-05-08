"use client";

import * as React from "react";
import { IepProgressFeature } from "@/components/montessori/iep";
import { ProgressFeature } from "@/components/montessori/progress";
import { SessionNotesFeature } from "@/components/montessori/session-notes";
import { useMontessori } from "@/components/montessori/store";
import {
  PROGRAM_LABEL,
  PROGRAM_ORDER,
  type ProgressProgram,
} from "@/lib/queries/progress-programs";

export default function ProgressPage() {
  const store = useMontessori();
  const programs = useApplicablePrograms(store.classroomProgress?.programs);

  const [mode, setMode] = React.useState<ProgressProgram>(programs[0] ?? "montessori");

  // If the active classroom changes (eg. teacher switches schools), make sure
  // we land on a mode that's actually applicable.
  React.useEffect(() => {
    if (!programs.includes(mode)) setMode(programs[0] ?? "montessori");
  }, [programs, mode]);

  // No applicable programs at all — render Montessori as the safe default so
  // the page is never blank for an unconfigured classroom.
  const effectiveMode = programs.includes(mode) ? mode : (programs[0] ?? "montessori");

  return (
    <>
      {programs.length > 1 && (
        <ProgressModeToggle programs={programs} mode={effectiveMode} onChange={setMode} />
      )}
      {effectiveMode === "montessori" && <ProgressFeature />}
      {effectiveMode === "iep" && <IepProgressFeature />}
      {effectiveMode === "session_notes" && <SessionNotesFeature />}
    </>
  );
}

/** Computes the modes the current teacher can access. Today this is just the
 *  active classroom's `programs` array; once teachers can be assigned to
 *  multiple classrooms with different program types, this becomes the union
 *  of programs across their assignments. */
function useApplicablePrograms(programs: ProgressProgram[] | undefined): ProgressProgram[] {
  return React.useMemo(() => {
    const list = programs && programs.length > 0 ? programs : ["montessori" as const];
    // Preserve the canonical UI order regardless of how the data was stored.
    return PROGRAM_ORDER.filter((p) => list.includes(p));
  }, [programs]);
}

function ProgressModeToggle({
  programs,
  mode,
  onChange,
}: {
  programs: ProgressProgram[];
  mode: ProgressProgram;
  onChange: (m: ProgressProgram) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        padding: "12px 16px 0",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-canvas)",
      }}
    >
      {programs.map((p) => (
        <ModeTab key={p} active={mode === p} onClick={() => onChange(p)}>
          {PROGRAM_LABEL[p]}
        </ModeTab>
      ))}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="tap"
      onClick={onClick}
      style={{
        background: "transparent",
        border: 0,
        borderBottom: `2px solid ${active ? "var(--color-ink)" : "transparent"}`,
        color: active ? "var(--color-ink)" : "var(--color-ink-secondary)",
        padding: "8px 12px 10px",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        fontFamily: "inherit",
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}
