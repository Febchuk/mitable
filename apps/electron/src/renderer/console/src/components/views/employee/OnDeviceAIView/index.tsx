/**
 * On-Device AI Settings View
 *
 * VS Code extension-style download manager for local AI components.
 * Users can see what's installed, download missing components, start/stop
 * the inference server, and manage local storage.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Trash2,
  CheckCircle2,
  Circle,
  Loader2,
  Cpu,
  Zap,
  AlertCircle,
  ArrowLeft,
  Shield,
  Download,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface OnDeviceAIViewProps {
  embedded?: boolean;
}

interface AssetSummary {
  id: string;
  label: string;
  description: string;
  sizeBytes: number;
}

interface InstalledAsset {
  id: string;
  version: string;
  filePath: string;
  sizeBytes: number;
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

const ASSET_LABELS: Record<string, string> = {
  "llama-server": "Inference Engine",
  "vision-model": "Vision Model (SmolVLM2)",
  "vision-mmproj": "Vision Encoder",
  "text-model": "Text Model (Phi-3.5)",
  "whisper-server": "Whisper Server",
  "whisper-model": "Audio Model (Whisper Small)",
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function OnDeviceAIView({ embedded = false }: OnDeviceAIViewProps) {
  const navigate = useNavigate();

  const [platform, setPlatform] = useState<string>("");
  const [isSetUp, setIsSetUp] = useState(false);
  const [serverStatus, setServerStatus] = useState("stopped");
  const [whisperStatus, setWhisperStatus] = useState("stopped");
  const [installedAssets, setInstalledAssets] = useState<InstalledAsset[]>([]);
  const [missingAssets, setMissingAssets] = useState<AssetSummary[]>([]);
  const [totalDownloadBytes, setTotalDownloadBytes] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState<Map<string, DownloadProgress>>(new Map());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [onDeviceAllowed, setOnDeviceAllowed] = useState(true);
  const [onDeviceBlockReason, setOnDeviceBlockReason] = useState<string | null>(null);
  const [gpuDescription, setGpuDescription] = useState<string>("");
  const [inferenceTuning, setInferenceTuning] = useState<{
    llamaFlashAttn: "off" | "auto" | "on";
    whisperUseFlashAttn: boolean;
    llamaGpuLayers: number;
    llamaVramFit: boolean;
    llamaContextSize?: number;
  } | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{ id: string; label: string } | null>(null);
  const [removingAssetId, setRemovingAssetId] = useState<string | null>(null);

  const hasActiveAssetDownload = activeDownloads.size > 0;
  const isToggleBusy =
    isDownloading || isStarting || isStopping || hasActiveAssetDownload;
  const isEnabled = serverStatus === "running" && whisperStatus === "running";

  const loadStatus = useCallback(async () => {
    if (!window.consoleAPI?.onDeviceGetStatus) return;
    try {
      const [status, platformResult, summary] = await Promise.all([
        window.consoleAPI.onDeviceGetStatus(),
        window.consoleAPI.onDeviceGetPlatform(),
        window.consoleAPI.onDeviceGetDownloadSummary(),
      ]);
      setIsSetUp(status.isSetUp);
      setServerStatus(status.serverStatus);
      setWhisperStatus(status.whisperStatus ?? "stopped");
      setInstalledAssets(status.installedAssets);
      setOnDeviceAllowed(status.onDeviceAllowed !== false);
      setOnDeviceBlockReason(status.onDeviceBlockReason ?? null);
      setGpuDescription(status.gpuDescription ?? "");
      setInferenceTuning(status.inferenceTuning ?? null);
      setPlatform(typeof platformResult === "string" ? platformResult : "unknown");
      setMissingAssets(summary.assets);
      setTotalDownloadBytes(summary.totalBytes);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!removeConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRemoveConfirm(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [removeConfirm]);

  useEffect(() => {
    if (!window.consoleAPI?.onDeviceDownloadProgress) return;
    const unsubscribe = window.consoleAPI.onDeviceDownloadProgress((progress) => {
      if (progress.phase === "complete") {
        setCompletedIds((prev) => new Set(prev).add(progress.assetId));
        setActiveDownloads((prev) => {
          const next = new Map(prev);
          next.delete(progress.assetId);
          return next;
        });
      } else if (progress.phase === "error") {
        setError(progress.error || `Failed to download ${progress.label}`);
        setActiveDownloads((prev) => {
          const next = new Map(prev);
          next.delete(progress.assetId);
          return next;
        });
      } else {
        setActiveDownloads((prev) => new Map(prev).set(progress.assetId, progress));
      }
    });
    return unsubscribe;
  }, []);

  const handleEnable = async () => {
    setError(null);
    if (!onDeviceAllowed) {
      setError(onDeviceBlockReason ?? "On-device AI is not available on this system.");
      return;
    }

    // If components aren't fully installed, download first
    if (!isSetUp) {
      setIsDownloading(true);
      setCompletedIds(new Set());
      setActiveDownloads(new Map());
      try {
        const result = await window.consoleAPI.onDeviceDownloadAll();
        if (!result.success) {
          setError(result.error || "Download failed");
          setIsDownloading(false);
          return;
        }
      } catch (err) {
        setError(String(err));
        setIsDownloading(false);
        return;
      } finally {
        setIsDownloading(false);
        setActiveDownloads(new Map());
        setCompletedIds(new Set());
        await loadStatus();
      }
    }

    // Start the server
    setIsStarting(true);
    try {
      const result = await window.consoleAPI.onDeviceStartServer();
      if (!result.success) setError(result.error || "Failed to start server");
      else setServerStatus("running");
    } catch (err) {
      setError(String(err));
    } finally {
      setIsStarting(false);
      loadStatus();
    }
  };

  const handleDisable = async () => {
    setIsStopping(true);
    try {
      await window.consoleAPI.onDeviceStopServer();
      setServerStatus("stopped");
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

  const confirmRemoveAsset = async () => {
    if (!removeConfirm || !window.consoleAPI?.onDeviceRemoveAsset) return;
    setRemovingAssetId(removeConfirm.id);
    setError(null);
    try {
      const result = await window.consoleAPI.onDeviceRemoveAsset(removeConfirm.id);
      if (!result.success) {
        setError(result.error || "Remove failed");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setRemovingAssetId(null);
      setRemoveConfirm(null);
      await loadStatus();
    }
  };

  /** Per-component download (no need to enable On-Device AI first). */
  const handleDownloadOne = async (assetId: string) => {
    if (!onDeviceAllowed) {
      setError(onDeviceBlockReason ?? "Cannot download on this system.");
      return;
    }
    setError(null);
    try {
      const result = await window.consoleAPI.onDeviceDownloadAsset(assetId);
      if (!result.success) {
        setError(result.error || `Failed to download ${assetId}`);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      await loadStatus();
    }
  };

  const getToggleSubtext = () => {
    if (isDownloading) return "Downloading components...";
    if (isStarting) return "Starting local AI servers...";
    if (isStopping) return "Stopping local AI servers...";
    if (isEnabled) return "Vision + Audio inference servers active";
    if (serverStatus === "running" && whisperStatus !== "running")
      return "Vision server running, Whisper starting...";
    return "Downloads components and starts local AI servers";
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
            Run AI inference locally on your machine. Screenshots never leave your computer.
          </p>
        </div>
      </div>

      {/* Master toggle — always visible */}
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
          <Shield size={16} style={{ color: isEnabled ? "#22c55e" : "var(--text-secondary)", flexShrink: 0 }} />
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
          {isToggleBusy && (
            <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
          )}
          {(isEnabled || isStarting) && (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: isEnabled ? "#22c55e" : "var(--text-tertiary)",
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
            <p style={{ margin: "0 0 6px", fontWeight: 600 }}>NVIDIA GPU required on Windows</p>
            <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.45 }}>
              {onDeviceBlockReason} AMD GPUs do not use CUDA; a separate build would use Vulkan or
              DirectML. This test path is NVIDIA + CUDA only.
            </p>
          </div>
        </div>
      )}

      {/* Platform detection */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: "var(--bg-secondary)",
          borderRadius: 8,
          marginBottom: 20,
          fontSize: 13,
          color: "var(--text-secondary)",
        }}
      >
        <Cpu size={15} />
        <span>
          Detected:{" "}
          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
            {gpuDescription ||
              platform.replace("-", " / ").replace("win32", "Windows").replace("darwin", "macOS")}
          </span>
        </span>
        {(platform.includes("cuda") || gpuDescription.includes("NVIDIA")) && onDeviceAllowed && (
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
            GPU Accelerated
          </span>
        )}
      </div>

      {inferenceTuning && onDeviceAllowed && (
        <p
          style={{
            margin: "-12px 0 20px",
            fontSize: 12,
            color: "var(--text-tertiary)",
            lineHeight: 1.45,
          }}
        >
          Server tuning: llama{" "}
          <code style={{ fontSize: 11 }}>
            --n-gpu-layers {inferenceTuning.llamaGpuLayers ?? -1}
          </code>
          {inferenceTuning.llamaContextSize != null && (
            <>
              {" · "}
              <code style={{ fontSize: 11 }}>
                --ctx-size {inferenceTuning.llamaContextSize}
              </code>
            </>
          )}
          {" · "}
          <code style={{ fontSize: 11 }}>--flash-attn {inferenceTuning.llamaFlashAttn}</code>
          {" · "}
          <code style={{ fontSize: 11 }}>
            --fit {(inferenceTuning.llamaVramFit ?? true) ? "on" : "off"}
          </code>
          {" · "}
          whisper flash-attn {inferenceTuning.whisperUseFlashAttn ? "on" : "off"}. Ollama uses a
          different engine than our bundled llama.cpp; GTX 10xx still gets full GPU layers here with
          safer flags (flash off, fit off, lower ctx when detected).
        </p>
      )}

      {/* Components list */}
      <div style={{ marginBottom: 24 }}>
        <h2
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 12px",
          }}
        >
          Components
        </h2>

        <div
          style={{
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {/* Installed assets */}
          {installedAssets.map((asset) => (
            <div
              key={asset.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <CheckCircle2
                size={16}
                style={{ color: "#22c55e", flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    margin: 0,
                  }}
                >
                  {ASSET_LABELS[asset.id] || asset.id}
                </p>
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: 0 }}>
                  {formatBytes(asset.sizeBytes)} installed
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: "#22c55e",
                    fontWeight: 500,
                  }}
                >
                  Installed
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${ASSET_LABELS[asset.id] || asset.id}`}
                  title="Remove this component"
                  disabled={hasActiveAssetDownload || removingAssetId !== null}
                  onClick={() =>
                    setRemoveConfirm({
                      id: asset.id,
                      label: ASSET_LABELS[asset.id] || asset.id,
                    })
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    padding: 0,
                    borderRadius: 6,
                    border: "1px solid var(--border-subtle)",
                    background: "var(--bg-overlay)",
                    color: "var(--text-secondary)",
                    cursor:
                      hasActiveAssetDownload || removingAssetId !== null
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      hasActiveAssetDownload || removingAssetId !== null ? 0.35 : 1,
                  }}
                >
                  <X size={14} strokeWidth={2.25} />
                </button>
              </div>
            </div>
          ))}

          {/* Missing assets */}
          {missingAssets.map((asset) => {
            const justCompleted = completedIds.has(asset.id);
            const dl = activeDownloads.get(asset.id);
            const isActive = !!dl;

            return (
              <div
                key={asset.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                {justCompleted ? (
                  <CheckCircle2
                    size={16}
                    style={{ color: "#22c55e", flexShrink: 0 }}
                  />
                ) : isActive ? (
                  <Loader2
                    size={16}
                    className="animate-spin"
                    style={{ color: "#22c55e", flexShrink: 0 }}
                  />
                ) : (
                  <Circle
                    size={16}
                    style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      margin: 0,
                    }}
                  >
                    {asset.label}
                  </p>
                  {isActive && dl ? (
                    <div style={{ marginTop: 4 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 11,
                          color: "var(--text-secondary)",
                          marginBottom: 3,
                        }}
                      >
                        <span>
                          {dl.phase === "extracting"
                            ? "Extracting..."
                            : `${formatBytes(dl.bytesDownloaded)} / ${formatBytes(dl.totalBytes)}`}
                        </span>
                        <span>{dl.percent}%</span>
                      </div>
                      <div
                        style={{
                          height: 3,
                          background: "rgba(255, 255, 255, 0.08)",
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${dl.percent}%`,
                            background: "#22c55e",
                            borderRadius: 2,
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: 0 }}>
                      {asset.description} — {formatBytes(asset.sizeBytes)}
                    </p>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  {!justCompleted && !isActive && (
                    <button
                      type="button"
                      onClick={() => handleDownloadOne(asset.id)}
                      disabled={!onDeviceAllowed || isToggleBusy}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--text-primary)",
                        background: "var(--bg-overlay)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 6,
                        cursor:
                          !onDeviceAllowed || isToggleBusy ? "not-allowed" : "pointer",
                        opacity: !onDeviceAllowed || isToggleBusy ? 0.5 : 1,
                      }}
                    >
                      <Download size={14} />
                      Download
                    </button>
                  )}
                  <span
                    style={{
                      fontSize: 11,
                      color: justCompleted ? "#22c55e" : "var(--text-tertiary)",
                      fontWeight: justCompleted ? 500 : 400,
                      minWidth: 72,
                      textAlign: "right" as const,
                    }}
                  >
                    {justCompleted
                      ? "Installed"
                      : isActive
                        ? ""
                        : "Not installed"}
                  </span>
                </div>
              </div>
            );
          })}

          {installedAssets.length === 0 && missingAssets.length === 0 && (
            <div
              style={{
                padding: "20px 16px",
                textAlign: "center",
                color: "var(--text-tertiary)",
                fontSize: 13,
              }}
            >
              No components detected
            </div>
          )}
        </div>
      </div>

      {/* Remove all */}
      {installedAssets.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <button
            type="button"
            onClick={handleRemoveAll}
            disabled={isRemoving || isEnabled || hasActiveAssetDownload}
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
            {isRemoving ? "Removing..." : "Remove All"}
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
          <strong>Models:</strong> SmolVLM2-2.2B (vision) + Phi-3.5 Mini 3.8B (text) + Whisper Small (audio)
        </p>
        <p style={{ margin: "0 0 4px" }}>
          <strong>Storage:</strong> ~4.6 GB total for all components
        </p>
        <p style={{ margin: 0 }}>
          <strong>Requirements:</strong> 8 GB+ RAM. Windows: NVIDIA GPU with CUDA (bundled
          llama.cpp / whisper.cpp CUDA 12.4 builds). AMD not supported in this build.
        </p>
      </div>

      {removeConfirm && (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(0, 0, 0, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={() => !removingAssetId && setRemoveConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-asset-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 400,
              background: "var(--bg-raised)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 12,
              padding: "20px 22px",
              boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
            }}
          >
            <h3
              id="remove-asset-title"
              style={{
                margin: "0 0 10px",
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              Remove component?
            </h3>
            <p
              style={{
                margin: "0 0 20px",
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--text-secondary)",
              }}
            >
              Remove <strong style={{ color: "var(--text-primary)" }}>{removeConfirm.label}</strong>{" "}
              from this device? You can download it again later. If On-Device AI is running, it will be
              stopped automatically first.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                disabled={!!removingAssetId}
                onClick={() => setRemoveConfirm(null)}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 8,
                  border: "1px solid var(--border-subtle)",
                  background: "transparent",
                  color: "var(--text-primary)",
                  cursor: removingAssetId ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!!removingAssetId}
                onClick={() => confirmRemoveAsset()}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 8,
                  border: "none",
                  background: "var(--status-error)",
                  color: "#fff",
                  cursor: removingAssetId ? "not-allowed" : "pointer",
                  opacity: removingAssetId ? 0.7 : 1,
                }}
              >
                {removingAssetId ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
