import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Monitor, MousePointerClick, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useUser } from "../context/UserContext";
import { usePermissions } from "../hooks/usePermissions";

const TOTAL_STEPS = 3;

// ---------------------------------------------------------------------------
// Arrow nav button (36px circle, matches WeekStrip / carousel pattern)
// ---------------------------------------------------------------------------

function NavArrow({
  direction,
  onClick,
  visible = true,
}: {
  direction: "left" | "right";
  onClick: () => void;
  visible?: boolean;
}) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      className="transition-colors"
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-overlay)",
        border: "0.5px solid rgba(var(--ui-rgb), 0.10)",
        color: "var(--text-secondary)",
        cursor: "pointer",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--mi-accent)";
        e.currentTarget.style.borderColor = "var(--mi-accent-border)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--text-secondary)";
        e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.10)";
      }}
    >
      <Icon size={18} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Step dots (pill-shaped indicator)
// ---------------------------------------------------------------------------

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width: i === current ? 20 : 6,
            height: 6,
            background:
              i === current
                ? "var(--mi-accent)"
                : i < current
                  ? "rgba(var(--mi-accent-rgb), 0.40)"
                  : "rgba(var(--ui-rgb), 0.18)",
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Permission row (Step 1)
// ---------------------------------------------------------------------------

function PermissionRow({
  icon: Icon,
  label,
  description,
  granted,
  buttonLabel,
  onAction,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  granted: boolean;
  buttonLabel: string;
  onAction: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between p-4 rounded-lg"
      style={{
        background: "var(--bg-overlay)",
        border: "0.5px solid rgba(var(--ui-rgb), 0.10)",
      }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div
          className="flex items-center justify-center rounded-lg shrink-0"
          style={{
            width: 36,
            height: 36,
            background: "rgba(var(--ui-rgb), 0.06)",
          }}
        >
          <Icon size={18} style={{ color: "var(--text-secondary)" }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {label}
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {description}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{
            background: granted
              ? "rgba(var(--status-success-rgb), 0.10)"
              : "rgba(var(--status-warning-rgb), 0.10)",
            color: granted ? "var(--status-success)" : "var(--status-warning)",
          }}
        >
          {granted ? "Granted" : "Required"}
        </span>
        {!granted && (
          <button
            onClick={onAction}
            className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
            style={{
              background: "rgba(var(--mi-accent-rgb), 0.10)",
              color: "var(--mi-accent)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(var(--mi-accent-rgb), 0.20)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(var(--mi-accent-rgb), 0.10)";
            }}
          >
            {buttonLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Permissions
// ---------------------------------------------------------------------------

function StepPermissions() {
  const { screen, accessibility, openScreenRecording, requestAccessibility } = usePermissions();

  return (
    <div style={{ animation: "revealUp 0.3s ease" }}>
      <h2
        className="text-xl mb-1.5"
        style={{
          fontFamily: "var(--font-serif)",
          color: "var(--text-primary)",
          fontWeight: 400,
          letterSpacing: "-0.01em",
        }}
      >
        Set up permissions
      </h2>
      <p className="text-sm mb-6" style={{ color: "var(--text-tertiary)", lineHeight: 1.6 }}>
        Mitable needs two macOS permissions to capture your work.
      </p>
      <div className="space-y-2.5">
        <PermissionRow
          icon={Monitor}
          label="Screen Recording"
          description="Required to capture screenshots"
          granted={screen === "granted"}
          buttonLabel="Open Settings"
          onAction={openScreenRecording}
        />
        <PermissionRow
          icon={MousePointerClick}
          label="Accessibility"
          description="Required to track keyboard & mouse activity"
          granted={accessibility}
          buttonLabel="Grant Access"
          onAction={requestAccessibility}
        />
      </div>
      <p className="text-xs mt-4" style={{ color: "var(--text-tertiary)", lineHeight: 1.5 }}>
        You may need to restart Mitable after granting Screen Recording.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — How sessions work
// ---------------------------------------------------------------------------

function StepHowItWorks() {
  const items = [
    {
      heading: "Start a focused session",
      body: "Tap the watch button to begin capturing your work.",
    },
    {
      heading: "Mitable captures context",
      body: "Screenshots and active app data are captured periodically.",
    },
    {
      heading: "Get an automatic summary",
      body: "Sessions are summarized and indexed when you end them.",
    },
  ];

  return (
    <div style={{ animation: "revealUp 0.3s ease" }}>
      <h2
        className="text-xl mb-1.5"
        style={{
          fontFamily: "var(--font-serif)",
          color: "var(--text-primary)",
          fontWeight: 400,
          letterSpacing: "-0.01em",
        }}
      >
        How sessions work
      </h2>
      <p className="text-sm mb-6" style={{ color: "var(--text-tertiary)", lineHeight: 1.6 }}>
        Mitable organizes your work into sessions — short focused periods of activity.
      </p>
      <ol className="space-y-4">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex gap-4"
            style={{ animation: `revealUp 0.35s ease ${i * 80}ms both` }}
          >
            <span
              className="shrink-0 text-xs font-semibold tabular-nums mt-0.5 w-5 text-right"
              style={{
                color: "var(--mi-accent)",
                fontVariantNumeric: "tabular-nums",
                lineHeight: "1.6",
              }}
            >
              {i + 1}.
            </span>
            <div>
              <p className="text-sm font-medium mb-0.5" style={{ color: "var(--text-primary)" }}>
                {item.heading}
              </p>
              <p className="text-sm" style={{ color: "var(--text-tertiary)", lineHeight: 1.6 }}>
                {item.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Passive monitoring toggle
// ---------------------------------------------------------------------------

function StepPassiveMonitoring({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (val: boolean) => void;
}) {
  return (
    <div style={{ animation: "revealUp 0.3s ease" }}>
      <h2
        className="text-xl mb-1.5"
        style={{
          fontFamily: "var(--font-serif)",
          color: "var(--text-primary)",
          fontWeight: 400,
          letterSpacing: "-0.01em",
        }}
      >
        Automatic sessions
      </h2>
      <p className="text-sm mb-6" style={{ color: "var(--text-tertiary)", lineHeight: 1.6 }}>
        Mitable can automatically start sessions when it detects you're actively working, and end
        them after a period of inactivity.
      </p>
      <div
        className="flex items-center justify-between p-4 rounded-lg"
        style={{
          background: "var(--bg-overlay)",
          border: "0.5px solid rgba(var(--ui-rgb), 0.10)",
        }}
      >
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Enable passive monitoring
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
            {enabled ? "Will start automatically" : "Manual sessions only"}
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      <p className="text-xs mt-4" style={{ color: "var(--text-tertiary)", lineHeight: 1.5 }}>
        You can change this at any time in Settings.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [passiveEnabled, setPassiveEnabled] = useState(false);

  useEffect(() => {
    window.consoleAPI
      ?.getPassiveMonitoringState()
      .then((state) => {
        setPassiveEnabled(state.state !== "disabled");
      })
      .catch(() => {});
  }, []);

  const handlePassiveToggle = (enabled: boolean) => {
    setPassiveEnabled(enabled);
    window.consoleAPI?.setPassiveMonitoringEnabled(enabled);
  };

  const completeOnboarding = async () => {
    if (user?.id) {
      await window.consoleAPI?.setOnboardingCompleted(user.id, true).catch(() => {});
    }
    if (user?.role === "admin") {
      navigate("/dashboard", { replace: true });
    } else {
      navigate("/calendar", { replace: true });
    }
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    } else {
      completeOnboarding();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleSkip = () => {
    completeOnboarding();
  };

  // Keyboard navigation: ArrowLeft / ArrowRight
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft" && step > 0) handleBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step]);

  const isFinalStep = step === TOTAL_STEPS - 1;

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "var(--bg-base)" }}
    >
      <div
        className="w-full max-w-lg rounded-xl p-8"
        style={{
          background: "var(--bg-raised)",
          border: "0.5px solid rgba(var(--ui-rgb), 0.10)",
        }}
      >
        {/* Step label */}
        <p
          className="text-xs font-medium tracking-wide uppercase mb-4"
          style={{ color: "var(--text-tertiary)", letterSpacing: "0.08em" }}
        >
          Step {step + 1} of {TOTAL_STEPS}
        </p>

        {/* Step content — keyed so it re-animates on change */}
        <div key={step} className="mb-8">
          {step === 0 && <StepPermissions />}
          {step === 1 && <StepHowItWorks />}
          {step === 2 && (
            <StepPassiveMonitoring enabled={passiveEnabled} onToggle={handlePassiveToggle} />
          )}
        </div>

        {/* Footer: ← dots → with skip below */}
        <div className="flex flex-col items-center gap-3">
          {/* Nav row: back arrow · dots · next arrow / tick */}
          <div className="flex items-center justify-between w-full">
            <NavArrow direction="left" onClick={handleBack} visible={step > 0} />
            <StepDots current={step} />
            {isFinalStep ? (
              <button
                onClick={handleNext}
                className="transition-colors"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--mi-accent)",
                  border: "none",
                  color: "#fff",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                <Check size={18} />
              </button>
            ) : (
              <NavArrow direction="right" onClick={handleNext} />
            )}
          </div>

          {/* Skip link below dots */}
          <button
            onClick={handleSkip}
            className="text-xs font-medium transition-colors"
            style={{ color: "var(--text-tertiary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--mi-accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
