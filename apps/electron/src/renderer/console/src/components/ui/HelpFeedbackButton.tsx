import { useState } from "react";
import { CircleHelp } from "lucide-react";
import FeedbackDialog, { type FeedbackAnonymousSource } from "../views/shared/FeedbackDialog";

interface HelpFeedbackButtonProps {
  anonymousSource: FeedbackAnonymousSource;
}

export default function HelpFeedbackButton({ anonymousSource }: HelpFeedbackButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Help and feedback"
        title="Help and feedback"
        style={{
          position: "fixed",
          left: 18,
          bottom: 18,
          width: 42,
          height: 42,
          borderRadius: "50%",
          border: "var(--border-subtle)",
          background: "rgba(var(--ui-rgb), 0.06)",
          color: "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 10px 26px rgba(0,0,0,0.32)",
          zIndex: 1000,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.10)";
          e.currentTarget.style.color = "var(--text-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.06)";
          e.currentTarget.style.color = "var(--text-secondary)";
        }}
      >
        <CircleHelp size={18} strokeWidth={1.7} />
      </button>

      <FeedbackDialog open={open} onOpenChange={setOpen} anonymousSource={anonymousSource} />
    </>
  );
}
