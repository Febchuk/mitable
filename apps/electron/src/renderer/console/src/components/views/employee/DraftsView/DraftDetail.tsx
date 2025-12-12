import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, CheckCircle } from "lucide-react";
import DraftEditor from "./DraftEditor";
import AIChatPanel from "./AIChatPanel";
import { DEMO_DRAFT, DEMO_CONFIG } from "@/console/src/data/demoDraft";
import { getRecipientById } from "@/console/src/data/demoRecipients";

export default function DraftDetail() {
  const navigate = useNavigate();
  const [content, setContent] = useState(DEMO_DRAFT.content);
  const [isSending, setIsSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([DEMO_CONFIG.recipients.defaultRecipientId]);
  const draft = DEMO_DRAFT; // Hard-coded demo

  // Get recipient names for display
  const recipientNames = recipients
    .map((id) => getRecipientById(id)?.name)
    .filter(Boolean);

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
  };

  const handleApplySuggestion = (suggestedEdit: string) => {
    setContent(suggestedEdit);
  };

  const handleRecipientsChange = (ids: string[]) => {
    setRecipients(ids);
  };

  const handleSend = () => {
    setIsSending(true);

    // Simulate sending
    setTimeout(() => {
      setIsSending(false);
      setShowSuccess(true);

      // Navigate back after showing success
      setTimeout(() => {
        navigate("/drafts");
      }, 1500);
    }, 800);
  };

  // Success state
  if (showSuccess) {
    return (
      <div className="h-full min-h-[calc(100vh-60px)] flex flex-col items-center justify-center">
        <div className="text-center animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={40} className="text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{DEMO_CONFIG.ui.success.title}</h2>
          <p className="text-text-secondary">
            {DEMO_CONFIG.ui.success.message}{" "}
            <span className="text-primary">
              {recipientNames.length === 1
                ? recipientNames[0]
                : `${recipientNames.length} recipients`}
            </span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-[calc(100vh-60px)] flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 flex-shrink-0 bg-background-secondary/50">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/drafts")}
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={18} />
            <span className="text-sm font-medium">Back to Drafts</span>
          </button>
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Send size={14} />
            <span>
              Sending to{" "}
              <span className="text-primary">
                {recipientNames.length === 0
                  ? "No recipients"
                  : recipientNames.length === 1
                    ? recipientNames[0]
                    : `${recipientNames.length} recipients`}
              </span>
            </span>
          </div>
        </div>
        <h1 className="text-xl font-bold text-text-primary mt-3">
          {draft.topic}
        </h1>
      </div>

      {/* Split Pane Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: Editor (60%) */}
        <div className="w-3/5 overflow-hidden flex flex-col bg-background-secondary/50">
          <DraftEditor
            content={content}
            onChange={handleContentChange}
            onSend={handleSend}
            isSending={isSending}
          />
        </div>

        {/* Right: AI Chat Panel (40%) */}
        <div className="w-2/5 overflow-hidden flex flex-col p-3 bg-background-secondary/50">
          <AIChatPanel
            onApplySuggestion={handleApplySuggestion}
            recipients={recipients}
            onRecipientsChange={handleRecipientsChange}
          />
        </div>
      </div>
    </div>
  );
}
