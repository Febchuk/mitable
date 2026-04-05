import {
  useOrganizationSettings,
  useUpdateOrganizationSettings,
} from "@/console/src/hooks/queries/admin";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrgVariant } from "@mitable/shared";

const VARIANT_OPTIONS: { value: OrgVariant; label: string; description: string }[] = [
  {
    value: "global",
    label: "Global (Default)",
    description: "Standard terminology: Docs, Artefacts",
  },
  {
    value: "nigeria",
    label: "Nigeria",
    description: "Regional terminology: Reports, Uploads",
  },
];

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative",
        transition: "background 0.2s",
        background: checked ? "rgba(var(--ui-rgb), 0.3)" : "rgba(var(--ui-rgb), 0.1)",
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "white",
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

export default function SetupView() {
  const { data: orgSettings, isLoading, error } = useOrganizationSettings();
  const { mutate: updateSettings, isPending: isUpdating } = useUpdateOrganizationSettings();

  const currentVariant = orgSettings?.settings?.variant || "global";

  const handleVariantChange = (variant: OrgVariant) => {
    updateSettings({ variant });
  };

  if (isLoading) {
    return (
      <div style={{ padding: "64px 0", textAlign: "center" }}>
        <div
          className="animate-spin"
          style={{
            width: 24,
            height: 24,
            margin: "0 auto 12px",
            borderRadius: "50%",
            border: "2px solid rgba(var(--ui-rgb), 0.1)",
            borderTopColor: "var(--text-secondary)",
          }}
        />
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Loading settings...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "64px 0", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>
          Failed to load organization settings
        </div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {error instanceof Error ? error.message : "Please try again later"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px" }}>
      {/* Region Variant section */}
      <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 400, color: "var(--text-primary)", margin: "0 0 6px", letterSpacing: "-0.2px" }}>
        Region Variant
      </h2>
      <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 20 }}>
        Customize UI labels based on your region. Changes the terminology for features like
        Documents and Artifacts.
      </p>

      <div style={{ borderTop: "var(--border-hairline)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 0",
            borderBottom: "var(--border-hairline)",
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
              {orgSettings?.name || "Your organization"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 3 }}>
              Applies to all users in the organization
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <Select
              value={currentVariant}
              onValueChange={(v) => handleVariantChange(v as OrgVariant)}
              disabled={isUpdating}
            >
              <SelectTrigger style={{ width: 200, height: 32, fontSize: 13 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VARIANT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{option.label}</div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                        {option.description}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isUpdating && (
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Saving...</span>
            )}
          </div>
        </div>
      </div>

      {/* Dashboard Panels section */}
      <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 400, color: "var(--text-primary)", margin: "32px 0 6px", letterSpacing: "-0.2px" }}>
        Dashboard Panels
      </h2>
      <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 20 }}>
        Choose which breakdowns appear on the dashboard.
      </p>

      <div style={{ borderTop: "var(--border-hairline)" }}>
        {/* Customer / Client toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 0",
            borderBottom: "var(--border-hairline)",
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
              Customer / Client Breakdown
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 3 }}>
              Show time allocation by customer
            </div>
          </div>
          <ToggleSwitch
            checked={orgSettings?.settings?.showCustomerBreakdown !== false}
            onChange={(checked) => updateSettings({ showCustomerBreakdown: checked })}
            disabled={isUpdating}
          />
        </div>

        {/* Project / Topic toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 0",
            borderBottom: "var(--border-hairline)",
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
              Project / Topic Breakdown
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 3 }}>
              Show time allocation by project
            </div>
          </div>
          <ToggleSwitch
            checked={orgSettings?.settings?.showTopicBreakdown !== false}
            onChange={(checked) => updateSettings({ showTopicBreakdown: checked })}
            disabled={isUpdating}
          />
        </div>
      </div>
    </div>
  );
}
