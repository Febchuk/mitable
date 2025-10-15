interface UserMessageProps {
  content: string;
}

export default function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="flex items-start gap-3 mb-4">
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-text-tertiary flex items-center justify-center text-sm font-semibold text-white flex-shrink-0">
        FC
      </div>

      {/* Message Bubble */}
      <div className="bg-[#1A1A1A] text-text-primary px-4 py-3 rounded-lg max-w-[600px]">
        <p className="text-sm leading-relaxed">{content}</p>
      </div>
    </div>
  );
}
