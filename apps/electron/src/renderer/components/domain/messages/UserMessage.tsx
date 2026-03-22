interface UserMessageProps {
  content: string;
}

export default function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="flex items-start gap-3 mb-4 justify-end">
      {/* Message Bubble - Right Aligned */}
      <div className="bg-accent text-canvas-base px-5 py-3.5 rounded-[18px] max-w-[600px] shadow-sm">
        <p className="text-[15px] leading-[1.6]">{content}</p>
      </div>
    </div>
  );
}
