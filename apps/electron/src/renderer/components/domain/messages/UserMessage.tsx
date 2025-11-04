interface UserMessageProps {
  content: string;
}

export default function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="flex items-start gap-3 mb-6 justify-end">
      {/* Message Bubble - Right Aligned */}
      <div className="bg-[#8B5CF6] text-white px-5 py-3.5 rounded-[18px] max-w-[600px] shadow-sm">
        <p className="text-[15px] leading-[1.6]">{content}</p>
      </div>

      {/* Avatar on Right */}
      <div className="w-10 h-10 rounded-full bg-[#3E3D3D] flex items-center justify-center text-sm font-medium text-white flex-shrink-0 mt-1">
        FC
      </div>
    </div>
  );
}
