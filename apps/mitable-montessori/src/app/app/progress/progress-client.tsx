"use client";

import { ProgressFeature } from "@/components/montessori/progress";
import { SpeechProgressFeature } from "@/components/montessori/speech";
import { useMontessori } from "@/components/montessori/store";
import * as React from "react";

type ProgressMode = "class" | "speech";

export default function ProgressClient() {
  const { showSpeechProgressTab } = useMontessori();
  const [mode, setMode] = React.useState<ProgressMode>("class");

  React.useEffect(() => {
    if (!showSpeechProgressTab && mode === "speech") setMode("class");
  }, [showSpeechProgressTab, mode]);

  if (!showSpeechProgressTab) {
    return <ProgressFeature />;
  }

  return (
    <>
      <ProgressModeToggle mode={mode} onChange={setMode} />
      {mode === "class" ? <ProgressFeature /> : <SpeechProgressFeature />}
    </>
  );
}

function ProgressModeToggle({
  mode,
  onChange,
}: {
  mode: ProgressMode;
  onChange: (m: ProgressMode) => void;
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
      <ModeTab active={mode === "speech"} onClick={() => onChange("speech")}>
        Speech
      </ModeTab>
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
