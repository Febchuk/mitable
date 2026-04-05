import { Settings, Globe, Check, BarChart3 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
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

export default function SetupView() {
  const { data: orgSettings, isLoading, error } = useOrganizationSettings();
  const { mutate: updateSettings, isPending: isUpdating } = useUpdateOrganizationSettings();

  const currentVariant = orgSettings?.settings?.variant || "global";

  const handleVariantChange = (variant: OrgVariant) => {
    updateSettings({ variant });
  };

  if (isLoading) {
    return (
      <div className="min-h-[500px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-2 border-indigo/20 border-t-indigo animate-spin" />
          </div>
          <span className="text-ink-tertiary text-sm font-medium">Loading settings...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[500px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-red-400 text-sm">Failed to load organization settings</div>
          <p className="text-ink-tertiary text-xs max-w-xs">
            {error instanceof Error ? error.message : "Please try again later"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto app-no-drag">
      <div className="px-8 pt-8 pb-6">
        <div className="stagger-1">
          {/* Header */}
          <div className="flex items-end justify-between mb-8">
            <div>
              <h1 className="font-display text-3xl font-semibold text-ink-primary tracking-tight">
                Setup
              </h1>
              <p className="text-ink-tertiary mt-1 text-sm">Configure your organization settings</p>
            </div>
          </div>

          {/* Organization Settings Card */}
          <div className="rounded-xl border border-stroke-subtle bg-canvas-overlay p-6 mb-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo/10 border border-indigo/20">
                <Settings size={20} className="text-indigo" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-ink-primary tracking-tight">
                  Organization Settings
                </h2>
                <p className="text-ink-tertiary text-sm">
                  {orgSettings?.name || "Your organization"}
                </p>
              </div>
            </div>

            {/* Variant Selector */}
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 rounded-lg bg-canvas-muted/50 border border-stroke-subtle">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                  <Globe size={18} className="text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div>
                      <h3 className="font-medium text-ink-primary">Region Variant</h3>
                      <p className="text-ink-tertiary text-sm mt-0.5">
                        Customize UI labels based on your region. Changes the terminology for
                        features like Documents and Artifacts.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Select
                      value={currentVariant}
                      onValueChange={(v) => handleVariantChange(v as OrgVariant)}
                      disabled={isUpdating}
                    >
                      <SelectTrigger className="w-[280px] h-10 text-sm bg-canvas-overlay border-stroke">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VARIANT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value} className="py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{option.label}</span>
                              {option.value === currentVariant && (
                                <Check size={14} className="text-emerald-400" />
                              )}
                            </div>
                            <p className="text-xs text-ink-tertiary mt-0.5">{option.description}</p>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isUpdating && <p className="text-xs text-ink-tertiary mt-2">Saving...</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Dashboard Panels Card */}
          <div className="rounded-xl border border-stroke-subtle bg-canvas-overlay p-6 mb-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo/10 border border-indigo/20">
                <BarChart3 size={20} className="text-indigo" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-ink-primary tracking-tight">
                  Dashboard Panels
                </h2>
                <p className="text-ink-tertiary text-sm">
                  Choose which breakdowns appear on the dashboard
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Customer / Client toggle */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-canvas-muted/50 border border-stroke-subtle">
                <div>
                  <h3 className="font-medium text-ink-primary">Customer / Client Breakdown</h3>
                  <p className="text-ink-tertiary text-sm mt-0.5">
                    Show time allocation by customer
                  </p>
                </div>
                <Switch
                  size="sm"
                  className="shrink-0"
                  checked={orgSettings?.settings?.showCustomerBreakdown !== false}
                  onCheckedChange={(checked) => updateSettings({ showCustomerBreakdown: checked })}
                  disabled={isUpdating}
                />
              </div>

              {/* Project / Topic toggle */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-canvas-muted/50 border border-stroke-subtle">
                <div>
                  <h3 className="font-medium text-ink-primary">Project / Topic Breakdown</h3>
                  <p className="text-ink-tertiary text-sm mt-0.5">
                    Show time allocation by project
                  </p>
                </div>
                <Switch
                  size="sm"
                  className="shrink-0"
                  checked={orgSettings?.settings?.showTopicBreakdown !== false}
                  onCheckedChange={(checked) => updateSettings({ showTopicBreakdown: checked })}
                  disabled={isUpdating}
                />
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="rounded-lg border border-stroke-subtle bg-canvas-muted/30 p-4">
            <p className="text-sm text-ink-secondary">
              <span className="font-medium text-ink-primary">Note:</span> Changing the region
              variant will update UI labels across the application for all users in your
              organization. The underlying data and functionality remain the same.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
