/**
 * LoadingMessage Component
 *
 * Displays a loading state with animated gradient text effect (ChatGPT-style).
 * Used to show progress updates while the agent is processing.
 *
 * Features:
 * - Transparent message bubble (no background)
 * - Animated gradient that moves across the text
 * - Smooth color transitions
 */

interface LoadingMessageProps {
  message: string;
}

export default function LoadingMessage({ message }: LoadingMessageProps) {
  return (
    <div className="loading-message flex items-start gap-3 py-2">
      {/* Animated gradient text */}
      <div
        className="loading-text animate-gradient bg-gradient-to-r from-text-secondary via-text-primary to-text-secondary bg-[length:200%_auto] bg-clip-text text-transparent text-sm font-medium"
        style={{
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {message}
      </div>
    </div>
  );
}
