import { useState, useEffect, useCallback } from "react";
import {
  Cpu,
  MemoryStick,
  Monitor,
  Zap,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { useUser } from "../../context/UserContext";

interface GpuInfo {
  name: string;
  vramMB: number;
  type: "dedicated" | "integrated";
  vendor: "nvidia" | "amd" | "intel" | "apple" | "unknown";
}

interface SystemInfo {
  cpu: string;
  ramMB: number;
  os: string;
  gpus: GpuInfo[];
  platform: string;
  error?: string;
}

interface AiStatus {
  serverStatus: string;
  isSetUp: boolean;
}

function formatVram(mb: number): string {
  if (mb <= 0) return "";
  if (mb >= 1024) return `${Math.round(mb / 1024)} GB`;
  return `${mb} MB`;
}

function vendorColor(vendor: GpuInfo["vendor"]): string {
  switch (vendor) {
    case "nvidia":
      return "#76b900";
    case "amd":
      return "#ed1c24";
    case "intel":
      return "#0071c5";
    case "apple":
      return "#a3aaae";
    default:
      return "var(--text-tertiary)";
  }
}

function vendorLabel(vendor: GpuInfo["vendor"]): string {
  switch (vendor) {
    case "nvidia":
      return "NVIDIA";
    case "amd":
      return "AMD";
    case "intel":
      return "Intel";
    case "apple":
      return "Apple";
    default:
      return "";
  }
}

export default function SetupTab() {
  const { user } = useUser();
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [selectedGpu, setSelectedGpu] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const loadSystemInfo = useCallback(async () => {
    try {
      const info = await window.consoleAPI.onDeviceGetSystemInfo();
      if (info.error) setError(info.error);
      setSystem(info);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const loadAiStatus = useCallback(async () => {
    try {
      const status = await window.consoleAPI.onDeviceGetStatus();
      setAiStatus({
        serverStatus: status.serverStatus,
        isSetUp: status.isSetUp,
      });
    } catch {
      // non-critical
    }
  }, []);

  const loadGpuPreference = useCallback(async () => {
    if (!user?.id) return;
    try {
      const pref = await window.consoleAPI.onDeviceGetGpuPreference(user.id);
      if (pref) setSelectedGpu(pref);
    } catch {
      // fall through to auto-select
    }
  }, [user?.id]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await Promise.all([loadSystemInfo(), loadAiStatus(), loadGpuPreference()]);
      setIsLoading(false);
    })();
  }, [loadSystemInfo, loadAiStatus, loadGpuPreference]);

  // Auto-select the best GPU if no preference is stored
  useEffect(() => {
    if (!system || selectedGpu) return;
    const dedicated = system.gpus.filter((g) => g.type === "dedicated");
    const best = dedicated.sort((a, b) => b.vramMB - a.vramMB)[0] ?? system.gpus[0];
    if (best) setSelectedGpu(best.name);
  }, [system, selectedGpu]);

  // Poll AI status while active
  useEffect(() => {
    if (!aiStatus) return;
    const active =
      aiStatus.serverStatus !== "stopped" &&
      aiStatus.serverStatus !== "ready" &&
      aiStatus.serverStatus !== "error";
    if (!active) return;
    const interval = setInterval(loadAiStatus, 2_000);
    return () => clearInterval(interval);
  }, [aiStatus, loadAiStatus]);

  const handleGpuSelect = async (gpuName: string) => {
    setSelectedGpu(gpuName);
    if (user?.id) {
      await window.consoleAPI.onDeviceSetGpuPreference(user.id, gpuName);
    }
  };

  const handleReinstall = async () => {
    setIsRemoving(true);
    try {
      await window.consoleAPI.onDeviceRemoveAll();
      await loadAiStatus();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsRemoving(false);
    }
  };

  const isMac = system?.platform === "darwin";

  if (isLoading) {
    return (
      <div style={{ padding: 8 }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)" }}
        >
          <Loader2 size={16} className="animate-spin" />
          <span style={{ fontSize: 13 }}>Detecting hardware...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: "var(--text-primary)",
            margin: "0 0 6px",
          }}
        >
          System
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0, lineHeight: 1.5 }}>
          Mitable uses your hardware to run AI locally. All data stays on your device.
        </p>
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

      {/* System overview cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
          marginBottom: 28,
        }}
      >
        {/* CPU */}
        <div
          style={{
            padding: "14px 16px",
            background: "var(--bg-secondary)",
            borderRadius: 10,
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Cpu size={13} style={{ color: "var(--text-tertiary)" }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Processor
            </span>
          </div>
          <p
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-primary)",
              margin: 0,
              lineHeight: 1.4,
              wordBreak: "break-word",
            }}
          >
            {system?.cpu ?? "Unknown"}
          </p>
        </div>

        {/* RAM */}
        <div
          style={{
            padding: "14px 16px",
            background: "var(--bg-secondary)",
            borderRadius: 10,
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <MemoryStick size={13} style={{ color: "var(--text-tertiary)" }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Memory
            </span>
          </div>
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>
            {system ? `${Math.round(system.ramMB / 1024)} GB` : "—"}
          </p>
        </div>

        {/* OS */}
        <div
          style={{
            padding: "14px 16px",
            background: "var(--bg-secondary)",
            borderRadius: 10,
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Monitor size={13} style={{ color: "var(--text-tertiary)" }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Operating System
            </span>
          </div>
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>
            {system?.os ?? "—"}
          </p>
        </div>
      </div>

      {/* Graphics cards */}
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>
            Graphics
          </h3>
          {!isMac && system && system.gpus.length > 1 && (
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              Select which GPU Mitable should use
            </span>
          )}
        </div>

        <div
          style={{
            borderRadius: 10,
            border: "1px solid var(--border-subtle)",
            overflow: "hidden",
          }}
        >
          {system?.gpus.map((gpu, i) => {
            const isSelected = gpu.name === selectedGpu;
            const canSelect = !isMac && system.gpus.length > 1;
            const vram = formatVram(gpu.vramMB);

            return (
              <div
                key={`${gpu.name}-${i}`}
                onClick={canSelect ? () => handleGpuSelect(gpu.name) : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  background: isSelected ? "rgba(34, 197, 94, 0.04)" : "var(--bg-secondary)",
                  borderBottom:
                    i < system.gpus.length - 1 ? "1px solid var(--border-subtle)" : "none",
                  cursor: canSelect ? "pointer" : "default",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (canSelect && !isSelected)
                    e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.04)";
                }}
                onMouseLeave={(e) => {
                  if (canSelect && !isSelected)
                    e.currentTarget.style.background = "var(--bg-secondary)";
                }}
              >
                {/* Selection indicator */}
                {canSelect && (
                  <div style={{ flexShrink: 0 }}>
                    {isSelected ? (
                      <CheckCircle2 size={16} style={{ color: "#22c55e" }} />
                    ) : (
                      <Circle size={16} style={{ color: "var(--text-tertiary)", opacity: 0.4 }} />
                    )}
                  </div>
                )}

                {/* GPU icon */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: `${vendorColor(gpu.vendor)}18`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Zap size={15} style={{ color: vendorColor(gpu.vendor) }} />
                </div>

                {/* GPU name & vendor */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      margin: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {gpu.name}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "2px 0 0" }}>
                    {vendorLabel(gpu.vendor)}
                    {vendorLabel(gpu.vendor) && gpu.type ? " · " : ""}
                    {gpu.type === "dedicated" ? "Dedicated" : "Integrated"}
                  </p>
                </div>

                {/* VRAM badge */}
                {vram && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                      background: "rgba(var(--ui-rgb), 0.06)",
                      padding: "3px 10px",
                      borderRadius: 6,
                      flexShrink: 0,
                    }}
                  >
                    {vram}
                  </span>
                )}

                {/* Selected label */}
                {isSelected && canSelect && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: "#22c55e",
                      flexShrink: 0,
                    }}
                  >
                    Active
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      {aiStatus?.isSetUp && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={handleReinstall}
            disabled={isRemoving || aiStatus?.serverStatus === "ready"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              background: "none",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: isRemoving || aiStatus?.serverStatus === "ready" ? "not-allowed" : "pointer",
              opacity: isRemoving || aiStatus?.serverStatus === "ready" ? 0.5 : 1,
              transition: "opacity 0.15s ease",
            }}
          >
            {isRemoving ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {isRemoving ? "Reinstalling..." : "Reinstall Models"}
          </button>
        </div>
      )}
    </div>
  );
}
