interface UserMessageProps {
  content: string;
  timestamp?: Date;
}

function formatMessageTime(date?: Date): string {
  if (!date) return "";
  const now = new Date();
  const msgDate = new Date(date);
  const diffMs = now.getTime() - msgDate.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  // Show time for today, date for older
  if (msgDate.toDateString() === now.toDateString()) {
    return msgDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return msgDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function UserMessage({ content, timestamp }: UserMessageProps) {
  return (
    <div className="mb-6 group flex justify-end">
      <div className="max-w-[70%]">
        {timestamp && (
          <div className="flex items-baseline gap-3 mb-2 justify-end">
            <span className="text-xs text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity">
              {formatMessageTime(timestamp)}
            </span>
          </div>
        )}
        <div className="bg-[#2f2f2f] text-white px-4 py-3 rounded-2xl text-[15px] leading-[1.6]">
          {content}
        </div>
      </div>
    </div>
  );
}
