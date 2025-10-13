import { useState } from "react";
import { useUser } from "../../context/UserContext";
import { ArrowUp } from "lucide-react";

export default function HomeView() {
  const { user } = useUser();
  const [inputValue, setInputValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    // TODO: Handle help request submission
    console.log("Help request:", inputValue);
    setInputValue("");
  };

  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="max-w-2xl w-full px-lg app-no-drag">
        {/* Welcome Heading */}
        <h1 className="text-5xl font-semibold text-center mb-xl">
          <span className="text-white">Welcome,</span>{" "}
          <span className="text-primary-light">{user?.firstName}</span>
        </h1>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="How can I help you today?"
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
