/**
 * On-Device AI Settings View
 *
 * Simplified for the Ollama + Gemma 4 pipeline.
 * Shows: enable/disable toggle, Ollama status, detected hardware tier,
 * model info, and a cleanup button.
 */

import { useState, useEffect, useCallback } from "react";
import { Trash2, Loader2, Cpu, Zap, AlertCircle, ArrowLeft, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface OnDeviceAIViewProps {
  embedded?: boolean;
}

interface DownloadProgress {
  assetId: string;
  label: string;
  phase: string;
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
  error?: string;
}

export default function OnDeviceAIView({ embedded = false }: OnDeviceAIViewProps) {
  const navigate = useNavigate();

  const [isSetUp, setIsSetUp] = useState(false);
  const [serverStatus, setServerStatus] = useState("stopped");
  const [model, setModel] = useState<string | null>(null);
  const [recommendedModel, setRecommendedModel] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [gpuDescription, setGpuDescription] = useState("");
  const [vramMB, setVramMB] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [hasNativeAudio, setHasNativeAudio] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onDeviceAllowed, setOnDeviceAllowed] = useState(true);
  const [onDeviceBlockReason, setOnDeviceBlockReason] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<DownloadProgress | null>(null);
  const [backendEnabled, setBackendEnabled] = useState(false);

  const isActive = serverStatus !== "stopped" && serverStatus !== "error";
  const isEnabled = serverStatus === "ready" || backendEnabled || isActive;
  const isToggleBusy = isStarting || isStopping;
  const displayModel = model || recommendedModel;

  const loadStatus = useCallback(async () => {
    if (!window.consoleAPI?.onDeviceGetStatus) return;
    try {
      const status = await window.consoleAPI.onDeviceGetStatus();
      setIsSetUp(status.isSetUp);
      setServerStatus(status.serverStatus);
      setModel(status.model ?? null);
      setRecommendedModel((status as any).recommendedModel ?? null);
      setTier(status.tier ?? null);
      setGpuDescription(status.gpuDescription ?? "");
      setVramMB(status.vramMB ?? 0);
      setHasNativeAudio(status.hasNativeAudio ?? false);
      setOnDeviceAllowed(status.onDeviceAllowed !== false);
      setOnDeviceBlockReason(status.onDeviceBlockReason ?? null);
      setBackendEnabled((status as any).enabled === true);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Poll while hardware is missing or pipeline is in an active non-ready state
  useEffect(() => {
    const needsHardwarePoll = !isLoading && !gpuDescription;
    const needsStatusPoll = isActive && serverStatus !== "ready";
    if (!needsHardwarePoll && !needsStatusPoll) return;
    const interval = setInterval(loadStatus, 2_000);
    return () => clearInterval(interval);
  }, [isLoading, gpuDescription, isActive, serverStatus, loadStatus]);

  useEffect(() => {
    if (!window.consoleAPI?.onDeviceDownloadProgress) return;
    const unsubscribe = window.consoleAPI.onDeviceDownloadProgress((progress: DownloadProgress) => {
      if (progress.phase === "error") {
        setPullProgress(null);
        if (progress.error) setError(progress.error);
        loadStatus();
      } else {
        setPullProgress(progress);
      }
    });
    return unsubscribe;
  }, [loadStatus]);

  const handleEnable = async () => {
    setError(null);
    if (!onDeviceAllowed) {
      setError(onDeviceBlockReason ?? "On-device AI is not available on this system.");
      return;
    }

    setIsStarting(true);
    try {
      const result = await window.consoleAPI.onDeviceStartServer();
      if (!result.success) setError(result.error || "Failed to start Ollama");
      else setServerStatus("ready");
    } catch (err) {
      setError(String(err));
    } finally {
      setIsStarting(false);
      setPullProgress(null);
      loadStatus();
    }
  };

  const handleDisable = async () => {
    setIsStopping(true);
    try {
      await window.consoleAPI.onDeviceStopServer();
      setServerStatus("stopped");
      setBackendEnabled(false);
      setPullProgress(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsStopping(false);
      loadStatus();
    }
  };

  const handleRemoveAll = async () => {
    setIsRemoving(true);
    try {
      await window.consoleAPI.onDeviceRemoveAll();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsRemoving(false);
      loadStatus();
    }
  };

  const getToggleSubtext = () => {
    if (pullProgress && pullProgress.phase === "pulling")
      return `${pullProgress.label} — ${pullProgress.percent}%`;
    if (pullProgress && pullProgress.phase === "warming") return pullProgress.label;
    if (pullProgress) return pullProgress.label;
    if (serverStatus === "warming") return `Loading ${displayModel ?? "model"} into VRAM...`;
    if (serverStatus === "pulling") return `Downloading ${displayModel ?? "model"}...`;
    if (serverStatus === "installing") return "Installing Ollama...";
    if (serverStatus === "starting") return "Starting Ollama...";
    if (isStarting) return "Starting Ollama and loading model...";
    if (isStopping) return "Stopping Ollama...";
    if (serverStatus === "ready" && model) return `Running ${model} via Ollama`;
    return "Downloads Ollama and a Gemma 4 model for local AI";
  };

  const getTierLabel = () => {
    if (!tier) return null;
    if (tier === "capable") return "Capable (E4B)";
    if (tier === "constrained") return "Constrained (E2B)";
    return "Integrated (Qwen3-VL)";
  };

  if (isLoading) {
    return (
      <div style={{ padding: 32, maxWidth: 720 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--text-secondary)",
          }}
        >
          <Loader2 size={16} className="animate-spin" />
          Loading on-device AI status...
        </div>
      </div>
    );
  }

  return (
    <div style={embedded ? {} : { padding: "24px 32px", maxWidth: 720, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        {!embedded && (
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              fontSize: 13,
              cursor: "pointer",
              padding: 0,
              marginBottom: 16,
            }}
          >
            <ArrowLeft size={14} />
            Back
          </button>
        )}

        <div
          style={{
            paddingBottom: 16,
            borderBottom: embedded ? "var(--border-hairline)" : "none",
          }}
        >
          <h2
            style={{
              fontSize: embedded ? 16 : 20,
              fontWeight: embedded ? 500 : 600,
              color: "var(--text-primary)",
              margin: "0 0 6px",
            }}
          >
            On-Device AI
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-tertiary)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Run AI inference locally with Ollama + Gemma 4. Screenshots and audio never leave your
            computer.
          </p>
        </div>
      </div>

      {/* Master toggle */}
      <div
        style={{
          padding: "16px",
          background: isEnabled ? "rgba(34, 197, 94, 0.06)" : "var(--bg-secondary)",
          border: isEnabled ? "1px solid rgba(34, 197, 94, 0.15)" : "1px solid transparent",
          borderRadius: 10,
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Shield
            size={16}
            style={{ color: isEnabled ? "#22c55e" : "var(--text-secondary)", flexShrink: 0 }}
          />
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>
              Enable On-Device AI
            </p>
            <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "2px 0 0" }}>
              {getToggleSubtext()}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {(isToggleBusy || pullProgress || (isActive && serverStatus !== "ready")) && (
            <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
          )}
          {serverStatus === "ready" && (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#22c55e",
              }}
            />
          )}
          <button
            type="button"
            role="switch"
            aria-checked={isEnabled}
            disabled={isToggleBusy || !onDeviceAllowed}
            onClick={() => {
              if (isEnabled) handleDisable();
              else handleEnable();
            }}
            style={{
              width: 36,
              height: 20,
              borderRadius: 10,
              border: "none",
              padding: 2,
              cursor: isToggleBusy ? "not-allowed" : "pointer",
              background: isEnabled ? "#22c55e" : "rgba(255,255,255,0.12)",
              transition: "background 0.2s ease",
              display: "flex",
              alignItems: "center",
              opacity: isToggleBusy ? 0.5 : 1,
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "#fff",
                transition: "transform 0.2s ease",
                transform: isEnabled ? "translateX(16px)" : "translateX(0)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }}
            />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {(pullProgress || (isActive && serverStatus !== "ready")) &&
        (() => {
          const hasDeterminateProgress =
            pullProgress?.phase === "pulling" && pullProgress.percent > 0;
          return (
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  marginBottom: 4,
                }}
              >
                <span>{pullProgress?.label ?? getToggleSubtext()}</span>
                {hasDeterminateProgress && <span>{pullProgress!.percent}%</span>}
              </div>
              <div
                style={{
                  height: 4,
                  background: "rgba(255, 255, 255, 0.08)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: hasDeterminateProgress ? `${pullProgress!.percent}%` : "100%",
                    background: "#22c55e",
                    borderRadius: 2,
                    transition: hasDeterminateProgress ? "width 0.3s ease" : "none",
                    animation: hasDeterminateProgress ? "none" : "pulse 1.5s ease-in-out infinite",
                    opacity: hasDeterminateProgress ? 1 : 0.5,
                  }}
                />
              </div>
            </div>
          );
        })()}

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 13,
            color: "#ef4444",
          }}
        >
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {!onDeviceAllowed && onDeviceBlockReason && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "10px 14px",
            background: "rgba(234, 179, 8, 0.08)",
            border: "1px solid rgba(234, 179, 8, 0.25)",
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 13,
            color: "var(--text-primary)",
          }}
        >
          <AlertCircle size={15} style={{ color: "#eab308", flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ margin: "0 0 6px", fontWeight: 600 }}>On-Device AI unavailable</p>
            <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.45 }}>
              {onDeviceBlockReason}
            </p>
          </div>
        </div>
      )}

      {/* Hardware info */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: "var(--bg-secondary)",
          borderRadius: 8,
          marginBottom: 12,
          fontSize: 13,
          color: "var(--text-secondary)",
        }}
      >
        <Cpu size={15} />
        <span>
          Detected:{" "}
          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
            {gpuDescription || "Unknown hardware"}
          </span>
          {vramMB > 0 && (
            <span style={{ color: "var(--text-tertiary)" }}>
              {" "}
              ({Math.round(vramMB / 1024)} GB VRAM)
            </span>
          )}
        </span>
        {vramMB > 0 && (
          <span
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: "#22c55e",
              fontSize: 12,
            }}
          >
            <Zap size={12} />
            GPU
          </span>
        )}
      </div>

      {/* Model & tier info — always visible once hardware is detected */}
      {tier && (
        <div
          style={{
            padding: "10px 14px",
            background: "var(--bg-secondary)",
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}
        >
          <p style={{ margin: 0 }}>
            <strong style={{ color: "var(--text-primary)" }}>Tier:</strong> {getTierLabel()}
            {" — text, vision, and audio via Gemma"}
          </p>
          {displayModel && (
            <p style={{ margin: "2px 0 0" }}>
              <strong style={{ color: "var(--text-primary)" }}>
                {isEnabled ? "Model:" : "Recommended model:"}
              </strong>{" "}
              {displayModel}
            </p>
          )}
        </div>
      )}

      {/* Remove all */}
      {isSetUp && (
        <div style={{ marginBottom: 24 }}>
          <button
            type="button"
            onClick={handleRemoveAll}
            disabled={isRemoving || isEnabled}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 18px",
              background: "none",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: isRemoving || isEnabled ? "not-allowed" : "pointer",
              opacity: isRemoving || isEnabled ? 0.5 : 1,
            }}
          >
            {isRemoving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {isRemoving ? "Removing..." : "Remove All Data"}
          </button>
        </div>
      )}

      {/* Info footer */}
      <div
        style={{
          fontSize: 12,
          color: "var(--text-tertiary)",
          lineHeight: 1.6,
        }}
      >
        <p style={{ margin: "0 0 4px" }}>
          <strong>Runtime:</strong> Ollama + Gemma 4 (auto-selected by hardware)
        </p>
        <p style={{ margin: "0 0 4px" }}>
          <strong>Constrained ({"<"}12 GB VRAM):</strong> Gemma 4 E2B — text, vision, and audio (~7
          GB)
        </p>
        <p style={{ margin: "0 0 4px" }}>
          <strong>Capable (12 GB+ VRAM):</strong> Gemma 4 E4B — text, vision, and audio (~10 GB)
        </p>
        <p style={{ margin: 0 }}>
          <strong>Privacy:</strong> All inference runs locally. Only session summaries leave your
          device.
        </p>
      </div>
    </div>
  );
}
