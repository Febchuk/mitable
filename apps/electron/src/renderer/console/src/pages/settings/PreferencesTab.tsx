import { Sun, Moon, Monitor, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type Theme = "dark" | "light" | "system";
type PillDisplayMode = "compact" | "expanded";

interface AudioDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

export interface PreferencesTabProps {
  currentTheme: Theme;
  setTheme: (theme: Theme) => void;

  pillDisplayMode: PillDisplayMode;
  isPillDisplayModeLoading: boolean;
  handlePillDisplayModeChange: (mode: PillDisplayMode) => void;

  audioDevices: AudioDevice[];
  audioOutputDevices: AudioDevice[];
  selectedMicId: string | null;
  selectedOutputId: string | null;
  isAudioPrefsLoading: boolean;
  handleMicrophoneChange: (deviceId: string) => void;
  handleOutputDeviceChange: (deviceId: string) => void;

  isMicTesting: boolean;
  micLevel: number;
  startMicTest: () => void;
  stopMicTest: () => void;
}

export default function PreferencesTab({
  currentTheme,
  setTheme,
  pillDisplayMode,
  isPillDisplayModeLoading,
  handlePillDisplayModeChange,
  audioDevices,
  audioOutputDevices,
  selectedMicId,
  selectedOutputId,
  isAudioPrefsLoading,
  handleMicrophoneChange,
  handleOutputDeviceChange,
  isMicTesting,
  micLevel,
  startMicTest,
  stopMicTest,
}: PreferencesTabProps) {
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Appearance */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              Appearance
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-tertiary)",
                margin: "6px 0 0",
              }}
            >
              Choose how Mitable looks. Select a theme or sync with your system.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { value: "light" as const, label: "Light", icon: Sun },
              { value: "dark" as const, label: "Dark", icon: Moon },
              { value: "system" as const, label: "System", icon: Monitor },
            ].map(({ value, label, icon: Icon }) => {
              const active = currentTheme === value;
              return (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    padding: "14px 12px",
                    borderRadius: 10,
                    border: active ? "1.5px solid var(--mi-accent)" : "var(--border-subtle)",
                    background: active ? "rgba(var(--ui-rgb), 0.04)" : "transparent",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.04)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Icon
                    size={20}
                    style={{
                      color: active ? "var(--mi-accent)" : "var(--text-tertiary)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: active ? 500 : 400,
                      color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    }}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Session Preferences */}
        <div
          style={{
            paddingTop: 24,
            borderTop: "var(--border-hairline)",
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Session Preferences
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "6px 0 0" }}>
            Customize how monitoring sessions behave
          </p>
        </div>

        {/* Pill Display Mode Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5 flex-1 pr-4">
            <Label
              htmlFor="pill-display-mode"
              className="text-sm font-medium text-text-primary cursor-pointer"
            >
              Always Show Expanded Pill
            </Label>
            <p className="text-xs text-text-tertiary">
              Keep the watching pill fully expanded with all controls visible instead of compact
              mode
            </p>
          </div>
          {isPillDisplayModeLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-text-tertiary flex-shrink-0" />
          ) : (
            <Switch
              id="pill-display-mode"
              size="sm"
              checked={pillDisplayMode === "expanded"}
              onCheckedChange={(checked) =>
                handlePillDisplayModeChange(checked ? "expanded" : "compact")
              }
              className="flex-shrink-0"
            />
          )}
        </div>

        {/* Audio Settings Section */}
        <div
          style={{
            paddingTop: 24,
            borderTop: "var(--border-hairline)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--text-tertiary)" }}
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              Audio Recording
            </h3>
          </div>
          <p className="text-body-sm text-text-tertiary">
            Configure your microphone and system audio for session recordings
          </p>

          {isAudioPrefsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
            </div>
          ) : (
            <>
              {/* Microphone Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-text-primary">Microphone</Label>
                <select
                  value={selectedMicId || "default"}
                  onChange={(e) => handleMicrophoneChange(e.target.value)}
                  className="w-full px-3 py-2 bg-background-elevated border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary cursor-pointer hover:bg-background-secondary transition-colors [&>option]:bg-background-elevated [&>option]:text-text-primary [&>option]:py-2"
                >
                  <option value="default" className="bg-background-elevated text-text-primary">
                    System Default (Auto-detect)
                  </option>
                  {audioDevices.map((device) => (
                    <option
                      key={device.deviceId}
                      value={device.deviceId}
                      className="bg-background-elevated text-text-primary"
                    >
                      {device.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-text-tertiary">
                  System Default will automatically use whichever microphone your computer is
                  currently using. Select a specific device to override this behavior.
                </p>
              </div>

              {/* System Audio Output Device Selection */}
              <div className="space-y-2 mt-6 pt-6 border-t border-border-subtle">
                <Label className="text-sm font-medium text-text-primary">System Audio Source</Label>
                <select
                  value={selectedOutputId || "default"}
                  onChange={(e) => handleOutputDeviceChange(e.target.value)}
                  className="w-full px-3 py-2 bg-background-elevated border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary cursor-pointer hover:bg-background-secondary transition-colors [&>option]:bg-background-elevated [&>option]:text-text-primary [&>option]:py-2"
                >
                  <option value="default" className="bg-background-elevated text-text-primary">
                    System Default (Auto-detect)
                  </option>
                  {audioOutputDevices.map((device) => (
                    <option
                      key={device.deviceId}
                      value={device.deviceId}
                      className="bg-background-elevated text-text-primary"
                    >
                      {device.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-text-tertiary">
                  Choose which speakers/output to monitor. If your monitor speakers aren't working,
                  select your physical speakers instead.
                </p>
              </div>

              {/* Mic Test Button with Level Visualization */}
              <div className="space-y-3 pt-2">
                <button
                  onClick={() => {
                    if (isMicTesting) {
                      stopMicTest();
                    } else {
                      startMicTest();
                    }
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isMicTesting
                      ? "bg-status-error/10 hover:bg-status-error/20 text-status-error border border-status-error/30"
                      : "bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary border border-accent-primary/30"
                  }`}
                >
                  {isMicTesting ? "Stop Testing" : "Test Microphone"}
                </button>

                {isMicTesting && (
                  <div className="space-y-2">
                    <p className="text-xs text-text-tertiary">
                      Speak into your microphone to see audio levels
                    </p>
                    <div className="flex items-center justify-center gap-1 h-16 px-3 py-2 bg-[#1a1a1a] rounded-lg border border-border-subtle">
                      {Array.from({ length: 20 }).map((_, i) => {
                        const center = 10;
                        const distanceFromCenter = Math.abs(i - center);
                        const threshold = (distanceFromCenter / 10) * 100;
                        const active = micLevel > threshold;
                        const isActive = active && micLevel > 5;
                        const barHeight = isActive
                          ? Math.max(8, Math.min(48, (micLevel / 100) * 48))
                          : 4;
                        const barWidth = isActive ? 3 : 4;

                        return (
                          <div
                            key={i}
                            className="transition-all duration-75"
                            style={{
                              width: `${barWidth}px`,
                              height: `${barHeight}px`,
                              backgroundColor: isActive ? "#10b981" : "#4b5563",
                              borderRadius: isActive ? "2px" : "50%",
                              opacity: isActive ? 1 : 0.5,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
