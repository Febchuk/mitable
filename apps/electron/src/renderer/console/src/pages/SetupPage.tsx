import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import AuthLogo from "../components/ui/AuthLogo";

const STAGE_LABELS: Record<string, string> = {
  checking: "Checking your setup...",
  copying_binary: "Preparing transcription engine...",
  downloading_model: "Downloading language model...",
  ready: "You're all set!",
};

export default function SetupPage() {
  const navigate = useNavigate();
  const [percent, setPercent] = useState(0);
  const [label, setLabel] = useState("Checking your setup...");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      // If whisper is already ready, skip straight to the app
      const status = await window.consoleAPI?.whisperStatus?.();
      if (status?.ready) {
        navigate("/", { replace: true });
        return;
      }

      // Listen for progress events
      const cleanup = window.consoleAPI?.onWhisperProgress?.((event) => {
        setPercent(event.percent);
        setLabel(STAGE_LABELS[event.stage] || event.label);
        if (event.stage === "ready") {
          setDone(true);
        }
      });

      // Trigger setup
      const result = await window.consoleAPI?.whisperRunSetup?.();
      cleanup?.();

      if (result?.success) {
        setDone(true);
        setPercent(100);
        setLabel("You're all set!");
      } else {
        setError(
          "Setup failed. You can still use the app — transcription will be unavailable until the model is downloaded."
        );
      }
    })();
  }, [navigate]);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => navigate("/", { replace: true }), 1200);
    return () => clearTimeout(timer);
  }, [done, navigate]);

  return (
    <div
      className="app-drag"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "var(--bg-base)",
        fontFamily: "var(--font-sans)",
        gap: 32,
        padding: 40,
      }}
    >
      <AuthLogo />

      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 24,
            fontWeight: 400,
            color: "var(--text-primary)",
            letterSpacing: "-0.3px",
            margin: "0 0 8px",
          }}
        >
          Setting up Mitable
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {done
            ? "Everything is ready. Taking you to the app..."
            : "This is a one-time setup. Your sessions will be transcribed locally for maximum privacy."}
        </p>
      </div>

      {/* Progress bar */}
      <div className="app-no-drag" style={{ width: "100%", maxWidth: 360 }}>
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: "rgba(var(--ui-rgb), 0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${percent}%`,
              borderRadius: 3,
              background: done ? "var(--status-success)" : "var(--mi-accent)",
              transition: "width 0.4s ease, background 0.3s ease",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 10,
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {percent}%
          </span>
        </div>
      </div>

      {error && (
        <div
          className="app-no-drag"
          style={{
            maxWidth: 360,
            padding: "12px 16px",
            borderRadius: 10,
            background: "rgba(232, 116, 116, 0.06)",
            border: "0.5px solid rgba(232, 116, 116, 0.2)",
          }}
        >
          <p style={{ fontSize: 12, color: "var(--status-error)", margin: 0, lineHeight: 1.5 }}>
            {error}
          </p>
          <button
            onClick={() => navigate("/", { replace: true })}
            style={{
              marginTop: 10,
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              background: "rgba(var(--ui-rgb), 0.08)",
              color: "var(--text-primary)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            Continue anyway
          </button>
        </div>
      )}
    </div>
  );
}
