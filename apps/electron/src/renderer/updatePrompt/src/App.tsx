import { useState, useEffect } from "react";
import { CheckCircle, Edit3, X } from "lucide-react";
import LogoIcon from "@/assets/logo-icon.svg";
import { DEMO_CONFIG } from "../../console/src/data/demoConfig";

interface DraftInfo {
  id: string;
  topic: string;
  recipient: string;
}

export default function App() {
  const [draft, setDraft] = useState<DraftInfo | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    // Listen for trigger from main process
    if (window.updatePromptAPI?.onTrigger) {
      window.updatePromptAPI.onTrigger((incomingDraft: DraftInfo) => {
        console.log("[UpdatePrompt] Received draft:", incomingDraft);
        setDraft(incomingDraft);
        setShowSuccess(false);
      });
    }
  }, []);

  const handleSendNow = () => {
    if (draft) {
      setShowSuccess(true);
      // Show success for 1.5s then dismiss
      setTimeout(() => {
        window.updatePromptAPI?.sendNow(draft.id);
      }, 1500);
    }
  };

  const handleEdit = () => {
    if (draft) {
      window.updatePromptAPI?.editDraft(draft.id);
    }
  };

  const handleDismiss = () => {
    window.updatePromptAPI?.dismiss();
  };

  // Show nothing if no draft (window will be hidden anyway)
  if (!draft) {
    return null;
  }

  // Success state after sending
  if (showSuccess) {
    return (
      <div className="h-full w-full flex items-center justify-center p-3">
        <div className="bg-[#1A1A1A]/95 backdrop-blur-lg rounded-3xl p-5 shadow-2xl border border-white/10 w-full animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-white font-medium text-sm">{DEMO_CONFIG.notifications.updatePrompt.successTitle}</p>
              <p className="text-text-secondary text-xs">
                {DEMO_CONFIG.notifications.updatePrompt.successMessage} {draft.recipient}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main prompt view
  return (
    <div className="h-full w-full flex items-center justify-center p-3 app-drag">
      <div className="bg-[#1A1A1A]/95 backdrop-blur-lg rounded-3xl p-5 shadow-2xl border border-white/10 w-full animate-in fade-in slide-in-from-top-2 duration-300">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <img
              src={LogoIcon}
              alt="Mitable"
              className="h-7 w-auto flex-shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-white font-medium text-sm truncate">{draft.topic}</p>
              <p className="text-text-secondary text-xs">
                {DEMO_CONFIG.notifications.updatePrompt.readyToSendLabel}{" "}
                <span className="text-blue-400">{draft.recipient}</span>
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-text-tertiary hover:text-white transition-colors p-1 -m-1 flex-shrink-0 app-no-drag"
          >
            <X size={16} />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 app-no-drag">
          <button
            onClick={handleEdit}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#2A2A2A] hover:bg-[#333333] rounded-xl text-white text-sm transition-colors"
          >
            <Edit3 size={14} />
            <span>{DEMO_CONFIG.notifications.updatePrompt.reviewButton}</span>
          </button>
          <button
            onClick={handleSendNow}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 rounded-xl text-white text-sm transition-colors"
          >
            <CheckCircle size={14} />
            <span>{DEMO_CONFIG.notifications.updatePrompt.sendNowButton}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
