import { useState } from "react";
import { useUser } from "../../../../context/UserContext";
import { ArrowUp } from "lucide-react";
import { createLogger } from "../../../../../../lib/logger";

const logger = createLogger("HomeView");

export default function HomeView() {
  const { user } = useUser();
  const [inputValue, setInputValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    // TODO: Handle help request submission
    logger.info("Help request:", inputValue);
    setInputValue("");
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-gradient-to-br from-background-primary via-[#1e1b4b] to-background-primary relative overflow-hidden">
      {/* Animated gradient orbs */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-3xl animate-pulse"></div>
      <div
        className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl animate-pulse"
        style={{ animationDelay: "1s" }}
      ></div>

      <div className="max-w-4xl w-full px-12 app-no-drag space-y-16 relative z-10">
        {/* Welcome Heading - Extra Large & Bold */}
        <div className="text-center space-y-6">
          <h1 className="text-7xl font-bold leading-tight tracking-tight">
            <span className="text-white">Welcome,</span>
            <br />
            <span className="bg-gradient-purple-blue bg-clip-text text-transparent">
              {user?.firstName}
            </span>
          </h1>
          <p className="text-text-secondary text-xl font-light">How can I assist you today?</p>
        </div>

        {/* Input Form - Large & Prominent */}
        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask me anything..."
            className="w-full bg-background-secondary/80 backdrop-blur-xl text-text-primary text-lg placeholder-text-tertiary px-8 py-6 pr-20 rounded-2xl border border-border-subtle outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent focus:shadow-glow-purple transition-all shadow-card-hover"
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-gradient-purple hover:shadow-glow-purple disabled:opacity-50 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-105"
            aria-label="Send message"
          >
            <ArrowUp size={24} className="text-white" />
          </button>
        </form>
      </div>
    </div>
  );
}
