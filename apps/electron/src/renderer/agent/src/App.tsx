import { useState } from "react";

declare global {
  interface Window {
    agentAPI: {
      toggle: () => void;
      showConsole: () => void;
      setIgnoreMouseEvents: (ignore: boolean) => void;
    };
  }
}

function App() {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    window.agentAPI.showConsole();
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    window.agentAPI.setIgnoreMouseEvents(false);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    window.agentAPI.setIgnoreMouseEvents(true);
  };

  return (
    <div className="w-full h-full flex items-center justify-center">
      <button
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`w-16 h-16 rounded-full bg-accent-primary hover:bg-accent-secondary transition-all duration-200 flex items-center justify-center text-2xl shadow-lg ${
          isHovered ? "scale-110" : "scale-100"
        }`}
      >
        🤖
      </button>
    </div>
  );
}

export default App;
