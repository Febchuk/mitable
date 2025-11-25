import { useState } from "react";
import { MessageSquare, Sparkles, Code, Zap } from "lucide-react";
import RichTextInput from "./RichTextInput";

interface EmptyStateProps {
  onNewChat: (initialMessage?: string) => void;
}

export default function EmptyState({ onNewChat }: EmptyStateProps) {
  const [inputValue, setInputValue] = useState("");

  const handleSubmit = () => {
    if (inputValue.trim()) {
      onNewChat(inputValue.trim());
      setInputValue("");
    }
  };

  return (
    <div className="h-full relative bg-[#0a0810]">
      {/* Main Content - Centered and Scrollable */}
      <div className="h-full overflow-y-auto flex items-center justify-center p-8 pb-32">
        <div className="max-w-2xl text-center space-y-8 w-full">
        {/* Hero Section */}
        <div className="space-y-4">
          <div className="w-24 h-24 bg-gradient-purple-blue rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-primary/30 animate-pulse-slow">
            <Sparkles size={48} className="text-white drop-shadow-lg" />
          </div>
          
          <h2 className="text-3xl font-bold text-white">
            Start a conversation
          </h2>
          
          <p className="text-text-secondary text-lg">
            Ask questions, get guidance, or explore your codebase with AI assistance
          </p>
        </div>

        {/* Suggestions */}
        <div className="pt-8 space-y-4">
          <p className="text-text-tertiary text-sm font-medium uppercase tracking-wide">
            Try asking about:
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={() => {
                setInputValue("How does authentication work?");
              }}
              className="p-4 bg-[#1a1625] rounded-lg border border-primary/20 hover:border-primary/50 hover:bg-[#231d2e] hover:shadow-lg hover:shadow-primary/10 transition-all text-left group"
            >
              <Code size={20} className="text-blue-400 mb-2 group-hover:scale-110 transition-transform drop-shadow-lg" />
              <p className="text-text-primary text-sm font-medium mb-1">
                Code Features
              </p>
              <p className="text-text-tertiary text-xs">
                "How does authentication work?"
              </p>
            </button>

            <button
              onClick={() => {
                setInputValue("What changed in the last commit?");
              }}
              className="p-4 bg-[#1a1625] rounded-lg border border-primary/20 hover:border-primary/50 hover:bg-[#231d2e] hover:shadow-lg hover:shadow-primary/10 transition-all text-left group"
            >
              <Zap size={20} className="text-purple-400 mb-2 group-hover:scale-110 transition-transform drop-shadow-lg" />
              <p className="text-text-primary text-sm font-medium mb-1">
                Recent Changes
              </p>
              <p className="text-text-tertiary text-xs">
                "What changed in the last commit?"
              </p>
            </button>

            <button
              onClick={() => {
                setInputValue("What did the team discuss this week?");
              }}
              className="p-4 bg-[#1a1625] rounded-lg border border-primary/20 hover:border-primary/50 hover:bg-[#231d2e] hover:shadow-lg hover:shadow-primary/10 transition-all text-left group"
            >
              <MessageSquare size={20} className="text-green-400 mb-2 group-hover:scale-110 transition-transform drop-shadow-lg" />
              <p className="text-text-primary text-sm font-medium mb-1">
                Team Knowledge
              </p>
              <p className="text-text-tertiary text-xs">
                "What did the team discuss this week?"
              </p>
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* Input Area - Floating at Bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0a0810] via-[#0a0810] to-transparent pointer-events-none">
        <div className="max-w-3xl mx-auto pointer-events-auto">
          <RichTextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            placeholder="Ask me anything..."
            disabled={false}
          />
        </div>
      </div>
    </div>
  );
}
