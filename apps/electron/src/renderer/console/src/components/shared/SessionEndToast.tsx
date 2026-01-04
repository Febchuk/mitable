import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface SessionEndToastProps {
  onDismiss: () => void;
  onDontAskAgain: (checked: boolean) => void;
  onHidePill: () => void;
}

export function SessionEndToast({
  onDismiss,
  onDontAskAgain,
  onHidePill,
}: SessionEndToastProps) {
  const [dontAskChecked, setDontAskChecked] = useState(false);

  const handleDontAskChange = (checked: boolean) => {
    setDontAskChecked(checked);
    onDontAskAgain(checked);
  };

  const handleHidePill = () => {
    onHidePill();
    onDismiss();
  };

  return (
    <div className="bg-background-elevated border border-border-subtle rounded-lg p-4 shadow-lg min-w-[320px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-white">Session Ended</h4>
          <p className="text-sm text-muted-foreground mt-1">
            Your monitoring session has ended. Would you like to hide the watching pill?
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id="dont-ask-again"
            checked={dontAskChecked}
            onCheckedChange={(checked) => handleDontAskChange(checked === true)}
          />
          <label
            htmlFor="dont-ask-again"
            className="text-xs text-muted-foreground cursor-pointer"
          >
            Don't ask again
          </label>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Keep Visible
          </Button>
          <Button
            size="sm"
            onClick={handleHidePill}
            className="bg-primary text-white hover:bg-primary/90"
          >
            Hide Pill
          </Button>
        </div>
      </div>
    </div>
  );
}
