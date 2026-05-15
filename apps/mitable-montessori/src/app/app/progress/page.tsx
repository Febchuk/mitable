"use client";

import * as React from "react";
import { IepProgressFeature } from "@/components/montessori/iep";
import { ProgressFeature } from "@/components/montessori/progress";
import { SpeechProgressFeature } from "@/components/montessori/speech";
import { useMontessori } from "@/components/montessori/store";

type ProgressMode = "class" | "iep" | "speech";

export default function ProgressPage() {
  const { showIepProgressTab, showSpeechProgressTab } = useMontessori();
  const [mode, setMode] = React.useState<ProgressMode>("class");

  React.useEffect(() => {
    if (!showIepProgressTab && mode === "iep") setMode("class");
  }, [showIepProgressTab, mode]);

  React.useEffect(() => {
    if (!showSpeechProgressTab && mode === "speech") setMode("class");
  }, [showSpeechProgressTab, mode]);

  const showModeToggle = showIepProgressTab || showSpeechProgressTab;

  return (
    <>
      {showModeToggle ? (
        <ProgressModeToggle
          mode={mode}
          onChange={setMode}
          showIep={showIepProgressTab}
          showSpeech={showSpeechProgressTab}
        />
      ) : null}
      {mode === "class" || !showModeToggle ? (
        <ProgressFeature />
      ) : mode === "iep" ? (
        <IepProgressFeature />
      ) : (
        <SpeechProgressFeature />
      )}
    </>
  );
}

function ProgressModeToggle({
  mode,
  onChange,
  showIep,
  showSpeech,
}: {
  mode: ProgressMode;
  onChange: (m: ProgressMode) => void;
  showIep: boolean;
  showSpeech: boolean;
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
      {showIep ? (
        <ModeTab active={mode === "iep"} onClick={() => onChange("iep")}>
          IEP progress
        </ModeTab>
      ) : null}
      {showSpeech ? (
        <ModeTab active={mode === "speech"} onClick={() => onChange("speech")}>
          Speech
        </ModeTab>
      ) : null}
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
