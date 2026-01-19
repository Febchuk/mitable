/**
 * EndSessionDialog
 *
 * Modal that appears when stopping a session.
 * Captures user preferences for the final summary (Storyteller Step 3).
 */

import { useState } from "react";
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
import { FileText, List, Sparkles } from "lucide-react";

interface EndSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (preferences: {
    style: "verbose" | "concise";
    format: "bullets" | "paragraphs";
    includeScreenshots: boolean;
  }) => Promise<void>;
  isProcessing: boolean;
}

export default function EndSessionDialog({
  open,
  onOpenChange,
  onConfirm,
  isProcessing,
}: EndSessionDialogProps) {
  const [style, setStyle] = useState<"verbose" | "concise">("concise");
  const [format, setFormat] = useState<"bullets" | "paragraphs">("bullets");
  const [includeScreenshots, setIncludeScreenshots] = useState(true);

  const handleConfirm = async () => {
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
