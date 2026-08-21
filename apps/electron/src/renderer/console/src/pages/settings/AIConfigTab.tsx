import { useState, useEffect, useCallback } from "react";
import { Eye, EyeOff, CheckCircle, XCircle, Loader2, Zap } from "lucide-react";
import { useUser } from "../../context/UserContext";
import { apiRequest } from "../../services/api";
import { createLogger } from "../../../../lib/logger";

const logger = createLogger("AIConfigTab");

type ProviderName = "google" | "openai" | "anthropic";

interface OrgSettings {
  inferenceProvider?: ProviderName;
  inferenceApiKeySet?: boolean;
  inferenceApiKeyMasked?: string;
}

function GeminiLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <path
        d="M14 0C14 7.732 7.732 14 0 14c7.732 0 14 6.268 14 14 0-7.732 6.268-14 14-14-7.732 0-14-6.268-14-14Z"
        fill="currentColor"
      />
    </svg>
  );
}

function OpenAILogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073ZM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494ZM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646ZM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872v.024Zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667Zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66v.018Zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681l-.004 6.722Zm1.098-2.367 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5-.005-2.999Z"
        fill="currentColor"
      />
    </svg>
  );
}

function AnthropicLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96Zm-7.258 0H10.172L16.74 20.48h-3.603L6.57 3.52ZM0 20.48h3.603L10.172 3.52H6.569L0 20.48Z"
        fill="currentColor"
      />
    </svg>
  );
}

const KEY_PREFIXES: Record<ProviderName, { prefix: string[]; hint: string }> = {
  google: { prefix: ["AIza"], hint: "Google keys start with AIza..." },
  openai: { prefix: ["sk-"], hint: "OpenAI keys start with sk-..." },
  anthropic: { prefix: ["sk-ant-"], hint: "Anthropic keys start with sk-ant-..." },
};

function validateKeyForProvider(provider: ProviderName, key: string): string | null {
  if (!key) return null;
  const trimmed = key.trim();
  const { prefix, hint } = KEY_PREFIXES[provider];

  if (provider === "openai" && trimmed.startsWith("sk-ant-")) {
    return "This looks like an Anthropic key, not an OpenAI key.";
  }

  if (!prefix.some((p) => trimmed.startsWith(p))) {
    return `Wrong key format for ${PROVIDERS.find((p) => p.id === provider)?.label}. ${hint}`;
  }
  return null;
}

const PROVIDERS: {
  id: ProviderName;
  label: string;
  description: string;
  logo: React.FC<{ size?: number }>;
}[] = [
  {
    id: "google",
    label: "Google Gemini",
    description: "Cheapest, great vision",
    logo: GeminiLogo,
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Reliable all-rounder",
    logo: OpenAILogo,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Fast and accurate",
    logo: AnthropicLogo,
  },
];

export default function AIConfigTab() {
  const { user } = useUser();
  const isAdmin = user?.role === "admin" || user?.originalRole === "admin";

  const [selectedProvider, setSelectedProvider] = useState<ProviderName>("google");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [savedSettings, setSavedSettings] = useState<OrgSettings>({});
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const isConnected = !!savedSettings.inferenceApiKeySet;

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiRequest<{ organization: { settings: OrgSettings } }>(
        "/admin/organization/settings"
      );
      const settings = data?.organization?.settings || {};

      setSavedSettings(settings);
      if (settings.inferenceProvider) {
        setSelectedProvider(settings.inferenceProvider);
      }
    } catch (err) {
      logger.error("Failed to load org settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadSettings();
  }, [isAdmin, loadSettings]);

  const handleSave = async () => {
    if (!apiKey && !savedSettings.inferenceApiKeySet) return;
    if (apiKey) {
      const err = validateKeyForProvider(selectedProvider, apiKey);
      if (err) {
        setKeyError(err);
        return;
      }
    }

    setSaving(true);
    setSaveMessage(null);
    setTestResult(null);

    try {
      const payload: Record<string, unknown> = {
        inferenceProvider: selectedProvider,
      };
      if (apiKey) {
        payload.inferenceApiKey = apiKey;
      }

      await apiRequest("/admin/organization/settings", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      // Refresh keyVault so this machine uses the new config immediately
      await window.consoleAPI?.refreshInferenceConfig?.();

      setSaveMessage(
        "Saved! Config is active now. Team members will pick it up on their next login."
      );
      setApiKey("");
      await loadSettings();
    } catch (err) {
      setSaveMessage(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setSaveMessage(null);
    setTestResult(null);

    try {
      await apiRequest("/admin/organization/settings", {
        method: "PATCH",
        body: JSON.stringify({
          inferenceProvider: null,
          inferenceApiKey: null,
        }),
      });

      // Clear keyVault immediately on this machine
      await window.consoleAPI?.refreshInferenceConfig?.();

      setSavedSettings({});
      setSelectedProvider("google");
      setApiKey("");
      setSaveMessage("Provider disconnected. Team members will lose AI analysis on next login.");
    } catch (err) {
      setSaveMessage(`Failed to disconnect: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      if (!window.consoleAPI?.testInferenceProvider) {
        setTestResult({ ok: false, error: "Restart the app to enable live provider testing." });
        return;
      }

      if (apiKey) {
        // New key entered — validate format then test with explicit provider + key
        const err = validateKeyForProvider(selectedProvider, apiKey);
        if (err) {
          setTestResult({ ok: false, error: err });
          return;
        }
        const result = await window.consoleAPI.testInferenceProvider(selectedProvider, apiKey);
        setTestResult(result);
      } else if (savedSettings.inferenceApiKeySet) {
        // No new key — refresh keyVault from backend then test
        await window.consoleAPI?.refreshInferenceConfig?.();
        const result = await window.consoleAPI.testInferenceProvider();
        setTestResult(result);
      } else {
        setTestResult({ ok: false, error: "Enter an API key first" });
      }
    } catch (err) {
      setTestResult({ ok: false, error: String(err) });
    } finally {
      setTesting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: "20px 0" }}>
        <h3
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 18,
            color: "var(--text-primary)",
            fontWeight: 400,
            marginBottom: 12,
          }}
        >
          AI Configuration
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6 }}>
          AI provider configuration is managed by your organization admin.
          {savedSettings.inferenceProvider && (
            <>
              {" "}
              Currently using:{" "}
              <strong>
                {PROVIDERS.find((p) => p.id === savedSettings.inferenceProvider)?.label}
              </strong>
            </>
          )}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "40px 0",
          color: "var(--text-tertiary)",
        }}
      >
        <Loader2 size={16} className="animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 0" }}>
      <h3
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 18,
          color: "var(--text-primary)",
          fontWeight: 400,
          marginBottom: 4,
        }}
      >
        AI Configuration
      </h3>
      <p style={{ color: "var(--text-tertiary)", fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
        Choose your AI provider and enter your API key. All team members will use this key for
        session analysis. The key is encrypted and stored securely.
      </p>

      {/* Provider selector */}
      <div style={{ marginBottom: 20 }}>
        <label
          style={{
            display: "block",
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 8,
          }}
        >
          Provider
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          {PROVIDERS.map((p) => {
            const isSelected = selectedProvider === p.id;
            const isLocked = isConnected && !isSelected;
            return (
              <button
                key={p.id}
                disabled={isLocked}
                onClick={() => {
                  if (isLocked) return;
                  setSelectedProvider(p.id);
                  setTestResult(null);
                  setSaveMessage(null);
                  if (apiKey) setKeyError(validateKeyForProvider(p.id, apiKey));
                }}
                style={{
                  flex: 1,
                  padding: "14px 14px",
                  borderRadius: 8,
                  border: isSelected
                    ? "1px solid var(--mi-accent)"
                    : "1px solid rgba(var(--ui-rgb), 0.08)",
                  background: isSelected ? "rgba(var(--mi-accent-rgb), 0.08)" : "var(--bg-raised)",
                  color: isSelected ? "var(--mi-accent)" : "var(--text-primary)",
                  cursor: isLocked ? "not-allowed" : "pointer",
                  opacity: isLocked ? 0.35 : 1,
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <p.logo size={18} />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: isSelected ? "var(--mi-accent)" : "var(--text-primary)",
                    }}
                  >
                    {p.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", paddingLeft: 26 }}>
                  {p.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* API key input */}
      <div style={{ marginBottom: 20 }}>
        <label
          style={{
            display: "block",
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 8,
          }}
        >
          API Key
          {savedSettings.inferenceApiKeySet && (
            <span style={{ color: "var(--text-tertiary)", marginLeft: 8 }}>
              (current: {savedSettings.inferenceApiKeyMasked})
            </span>
          )}
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => {
                const val = e.target.value;
                setApiKey(val);
                setKeyError(validateKeyForProvider(selectedProvider, val));
              }}
              placeholder={
                savedSettings.inferenceApiKeySet
                  ? "Enter new key to replace existing one"
                  : "Paste your API key here"
              }
              style={{
                width: "100%",
                padding: "10px 40px 10px 12px",
                borderRadius: 8,
                border: "1px solid rgba(var(--ui-rgb), 0.12)",
                background: "var(--bg-raised)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontFamily: "monospace",
                outline: "none",
              }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-tertiary)",
                padding: 4,
              }}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {keyError && (
            <p style={{ color: "var(--status-error)", fontSize: 11, marginTop: 6 }}>{keyError}</p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={handleSave}
          disabled={saving || !!keyError || (!apiKey && !savedSettings.inferenceApiKeySet)}
          style={{
            padding: "8px 20px",
            borderRadius: 6,
            border: "none",
            background: "var(--mi-accent)",
            color: "#1A1916",
            fontSize: 13,
            fontWeight: 500,
            cursor: saving ? "wait" : "pointer",
            opacity:
              saving || !!keyError || (!apiKey && !savedSettings.inferenceApiKeySet) ? 0.5 : 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {saving && <Loader2 size={13} className="animate-spin" />}
          {saving ? "Saving..." : "Save"}
        </button>

        {isConnected && (
          <>
            <button
              onClick={handleTest}
              disabled={testing}
              style={{
                padding: "8px 20px",
                borderRadius: 6,
                border: "1px solid rgba(var(--ui-rgb), 0.12)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: 13,
                cursor: testing ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Zap size={13} />
              {testing ? "Testing..." : "Test Connection"}
            </button>

            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              style={{
                padding: "8px 20px",
                borderRadius: 6,
                border: "1px solid rgba(232, 116, 116, 0.3)",
                background: "transparent",
                color: "var(--status-error)",
                fontSize: 13,
                cursor: disconnecting ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginLeft: "auto",
              }}
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </>
        )}
      </div>

      {/* Status messages */}
      {saveMessage && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 6,
            background: saveMessage.startsWith("Failed")
              ? "rgba(232, 116, 116, 0.08)"
              : "rgba(58, 155, 107, 0.08)",
            color: saveMessage.startsWith("Failed")
              ? "var(--status-error)"
              : "var(--status-success)",
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          {saveMessage}
        </div>
      )}

      {testResult && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: testResult.ok ? "var(--status-success)" : "var(--status-error)",
          }}
        >
          {testResult.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
          {testResult.ok ? "Connection successful" : `Connection failed: ${testResult.error}`}
        </div>
      )}
    </div>
  );
}
