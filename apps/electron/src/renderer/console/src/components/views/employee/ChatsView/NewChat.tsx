import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUp } from "lucide-react";
import { useChats } from "../../../../context/ChatsContext";

export default function NewChat() {
  const navigate = useNavigate();
  const { createNewChat } = useChats();
  const [inputValue, setInputValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    // Create new chat with first message
    const newChatId = createNewChat(inputValue.trim());

    // Navigate to the new chat detail page
    navigate(`/chats/${newChatId}`);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="p-8 pb-4 space-y-4 flex-shrink-0">
        <button
          onClick={() => navigate("/chats")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to Chats</span>
        </button>

        <div>
          <h1 className="text-4xl font-bold text-text-primary">Start a new conversation</h1>
        </div>
      </div>

      {/* Empty Messages Area */}
      <div className="flex-1 flex items-center justify-center px-8 py-4">
        <p className="text-text-secondary text-center text-lg">
          Type your first message below to start a conversation
        </p>
      </div>

      {/* Input Form */}
      <div className="p-8 pt-4 flex-shrink-0">
        <form onSubmit={handleSubmit} className="relative app-no-drag">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="How can I help you today?"
            autoFocus
            className="w-full bg-[#1A1A1A] text-text-primary placeholder-text-tertiary px-lg py-md pr-16 rounded-full border-none outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-primary hover:bg-primary-hover disabled:bg-primary/50 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-colors"
            aria-label="Send message"
          >
            <ArrowUp size={20} className="text-white" />
          </button>
        </form>
      </div>
    </div>
  );
}
