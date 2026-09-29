"use client";

import { ProgressFeature } from "@/components/montessori/progress";
import { SenReportsFeature } from "@/components/montessori/sen";
import { SpeechProgressFeature } from "@/components/montessori/speech";
import { useMontessori } from "@/components/montessori/store";
import * as React from "react";

type ProgressMode = "class" | "speech" | "sen";

export default function ProgressClient() {
  const { classroomProgress, selectedClassroomId, selectClassroom, showSpeechProgressTab } =
    useMontessori();
  const [mode, setMode] = React.useState<ProgressMode>("class");
  const showSenReportsTab = classroomProgress?.programs.includes("sen") ?? false;

  React.useEffect(() => {
    if (!classroomProgress && selectedClassroomId) void selectClassroom(selectedClassroomId);
  }, [classroomProgress, selectedClassroomId, selectClassroom]);

  React.useEffect(() => {
    if (!showSpeechProgressTab && mode === "speech") setMode("class");
  }, [showSpeechProgressTab, mode]);

  React.useEffect(() => {
    if (!showSenReportsTab && mode === "sen") setMode("class");
  }, [showSenReportsTab, mode]);

  if (!showSpeechProgressTab && !showSenReportsTab) {
    return <ProgressFeature />;
  }

  return (
    <>
      <ProgressModeToggle
        mode={mode}
        onChange={setMode}
        showSpeech={showSpeechProgressTab}
        showSen={showSenReportsTab}
      />
      {mode === "class" ? (
        <ProgressFeature />
      ) : mode === "speech" ? (
        <SpeechProgressFeature />
      ) : (
        <SenReportsFeature />
      )}
    </>
  );
}

function ProgressModeToggle({
  mode,
  onChange,
  showSpeech,
  showSen,
}: {
  mode: ProgressMode;
  onChange: (m: ProgressMode) => void;
  showSpeech: boolean;
  showSen: boolean;
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
      <ModeTab active={mode === "class"} onClick={() => onChange("class")}>
        Class progress
      </ModeTab>
      {showSpeech && (
        <ModeTab active={mode === "speech"} onClick={() => onChange("speech")}>
          Speech
        </ModeTab>
      )}
      {showSen && (
        <ModeTab active={mode === "sen"} onClick={() => onChange("sen")}>
          SEN reports
        </ModeTab>
      )}
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
