/**
 * @deprecated EndSessionDialog — session end now handled via pill + CalendarView. Set up for deletion.
 *
 * EndSessionDialog
 *
 * Modal that appears when stopping a session.
 * Captures user preferences for the final summary (Storyteller Step 3).
 * Enhanced with "Save as default" and "Don't ask again" options.
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, List, Sparkles } from "lucide-react";
import { createLogger } from "../../../../../../../lib/logger";
import { trackEvent } from "@/lib/posthog";

const logger = createLogger("EndSessionDialog");

interface EndSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (preferences: {
    style: "verbose" | "concise";
    format: "bullets" | "paragraphs";
    includeScreenshots: boolean;
  }) => Promise<void>;
  isProcessing: boolean;
  /** Optional: Initial preferences to pre-populate the form */
  initialPreferences?: {
    style?: "verbose" | "concise";
    format?: "bullets" | "paragraphs";
    includeScreenshots?: boolean;
  };
  /** Optional: Whether this dialog was triggered from the pill (affects behavior) */
  triggeredFromPill?: boolean;
}

export default function EndSessionDialog({
  open,
  onOpenChange,
  onConfirm,
  isProcessing,
  initialPreferences,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  triggeredFromPill: _triggeredFromPill = false,
}: EndSessionDialogProps) {
  const [style, setStyle] = useState<"verbose" | "concise">(initialPreferences?.style ?? "concise");
  const [format, setFormat] = useState<"bullets" | "paragraphs">(
    initialPreferences?.format ?? "bullets"
  );
  const [includeScreenshots, setIncludeScreenshots] = useState(
    initialPreferences?.includeScreenshots ?? true
  );
  const [saveAsDefaults, setSaveAsDefaults] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  // Load stored defaults when dialog opens
  useEffect(() => {
    if (open) {
      loadStoredDefaults();
    }
  }, [open]);

  const loadStoredDefaults = async () => {
    try {
      const defaults = await window.consoleAPI.getSummaryDefaults();
      if (defaults) {
        // Map detailLevel to style (backend uses detailLevel, frontend uses style)
        setStyle(defaults.detailLevel === "verbose" ? "verbose" : "concise");
        setFormat(defaults.format === "paragraphs" ? "paragraphs" : "bullets");
        setIncludeScreenshots(defaults.includeScreenshots ?? true);
        logger.info("Loaded stored defaults:", defaults);
      }
    } catch (error) {
      logger.error("Failed to load stored defaults:", error);
    }
  };

  const handleConfirm = async () => {
    // Save as defaults if checkbox is checked
    if (saveAsDefaults) {
      try {
        await window.consoleAPI.setSummaryDefaults({
          detailLevel: style,
          format,
          includeScreenshots,
        });
        logger.info("Saved preferences as defaults");
      } catch (error) {
        logger.error("Failed to save preferences as defaults:", error);
      }
    }

    // Disable future dialogs if "Don't ask again" is checked
    if (dontAskAgain) {
      try {
        // Also save as defaults when disabling future dialogs
        await window.consoleAPI.setSummaryDefaults({
          detailLevel: style,
          format,
          includeScreenshots,
        });
        await window.consoleAPI.setAlwaysAskOnSessionEnd(false);
        logger.info("Disabled future end session dialogs");
      } catch (error) {
        logger.error("Failed to disable future dialogs:", error);
      }
    }

    // Reset checkboxes for next time
    setSaveAsDefaults(false);
    setDontAskAgain(false);

    trackEvent("session_end_clicked", { summary_style: style, summary_format: format });

    await onConfirm({
      style,
      format,
      includeScreenshots,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Generate Session Update</DialogTitle>
          <DialogDescription>
            Choose how you want your session summary to be formatted.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Style Preference */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Detail Level</Label>
            <RadioGroup
              defaultValue="concise"
              value={style}
              onValueChange={(v) => setStyle(v as "verbose" | "concise")}
              className="grid grid-cols-2 gap-4"
            >
              <div>
                <RadioGroupItem value="concise" id="concise" className="peer sr-only" />
                <Label
                  htmlFor="concise"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <Sparkles className="mb-2 h-6 w-6" />
                  <span className="font-semibold">Concise</span>
                  <span className="text-xs text-muted-foreground mt-1">Key highlights</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem value="verbose" id="verbose" className="peer sr-only" />
                <Label
                  htmlFor="verbose"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <FileText className="mb-2 h-6 w-6" />
                  <span className="font-semibold">Verbose</span>
                  <span className="text-xs text-muted-foreground mt-1">Full narrative</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Format Preference */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Format</Label>
            <RadioGroup
              defaultValue="bullets"
              value={format}
              onValueChange={(v) => setFormat(v as "bullets" | "paragraphs")}
              className="grid grid-cols-2 gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="bullets" id="bullets" />
                <Label htmlFor="bullets" className="flex items-center gap-2 cursor-pointer">
                  <List className="w-4 h-4" /> Bullet Points
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="paragraphs" id="paragraphs" />
                <Label htmlFor="paragraphs" className="flex items-center gap-2 cursor-pointer">
                  <FileText className="w-4 h-4" /> Paragraphs
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Screenshots Toggle */}
          <div className="flex items-center justify-between space-x-2 rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">Include Screenshots</Label>
              <p className="text-sm text-muted-foreground">Attach key visuals to your update</p>
            </div>
            <Switch checked={includeScreenshots} onCheckedChange={setIncludeScreenshots} />
          </div>

          {/* Save as defaults checkbox */}
          <div className="flex items-start space-x-3 pt-2 border-t">
            <Checkbox
              id="save-defaults"
              checked={saveAsDefaults}
              onCheckedChange={(checked) => setSaveAsDefaults(checked === true)}
            />
            <div className="grid gap-1.5 leading-none">
              <Label
                htmlFor="save-defaults"
                className="text-sm font-medium leading-none cursor-pointer"
              >
                Save as my default preferences
              </Label>
              <p className="text-xs text-muted-foreground">
                Use these settings by default for future sessions
              </p>
            </div>
          </div>

          {/* Don't ask again checkbox */}
          <div className="flex items-start space-x-3">
            <Checkbox
              id="dont-ask"
              checked={dontAskAgain}
              onCheckedChange={(checked) => setDontAskAgain(checked === true)}
            />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="dont-ask" className="text-sm font-medium leading-none cursor-pointer">
                Don't ask me again
              </Label>
              <p className="text-xs text-muted-foreground">
                End sessions automatically using these preferences
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isProcessing}>
            {isProcessing ? "Generating..." : "Generate Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
