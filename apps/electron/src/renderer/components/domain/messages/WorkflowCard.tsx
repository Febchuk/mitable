import { LucideIcon } from "lucide-react";

interface WorkflowCardProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  onClick?: () => void;
}

export default function WorkflowCard({ title, subtitle, icon: Icon, onClick }: WorkflowCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-agent-card rounded-lg p-4 mb-4 flex items-center justify-between cursor-pointer hover:bg-agent-card/80 transition-colors"
    >
      <div className="flex-1">
        <h3 className="text-text-primary font-semibold text-base mb-1">{title}</h3>
        <p className="text-text-secondary text-sm">{subtitle}</p>
      </div>
      <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center flex-shrink-0 ml-4">
        <Icon size={24} className="text-white" />
      </div>
    </div>
  );
}
