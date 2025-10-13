import { LucideIcon } from "lucide-react";

interface InteractiveCardProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  onClick?: () => void;
}

export default function InteractiveCard({ title, subtitle, icon: Icon, onClick }: InteractiveCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-agent-card hover:bg-agent-card/90 rounded-lg p-4 flex items-center justify-between mb-4 transition-colors app-no-drag"
    >
      <div className="text-left">
        <h3 className="text-white font-semibold text-base mb-1">{title}</h3>
        <p className="text-text-secondary text-sm">{subtitle}</p>
      </div>
      <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center flex-shrink-0 ml-4">
        <Icon size={24} className="text-white" />
      </div>
    </button>
  );
}
