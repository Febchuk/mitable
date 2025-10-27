import { Plus } from "lucide-react";

interface NewChatOptionProps {
  onClick: () => void;
}

export default function NewChatOption({ onClick }: NewChatOptionProps) {
  return (
    <button
      onClick={onClick}
      className="w-full h-10 flex items-center gap-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors mb-2 app-no-drag"
    >
      <Plus className="w-4 h-4" />
      <span className="font-medium text-sm">New Chat</span>
    </button>
  );
}
