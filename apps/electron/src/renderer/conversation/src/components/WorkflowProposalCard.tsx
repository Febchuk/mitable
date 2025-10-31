import { ChevronRight, Clock, ListChecks } from "lucide-react";

interface WorkflowProposalCardProps {
  title: string;
  description: string;
  estimatedTime?: string;
  stepCount?: number;
  onBegin: () => void;
  onDecline?: () => void;
}

export default function WorkflowProposalCard({
  title,
  description,
  estimatedTime,
  stepCount,
  onBegin,
  onDecline,
}: WorkflowProposalCardProps) {
  return (
    <div className="my-4 p-6 bg-[#2A2A35] rounded-2xl border border-[#3A3A45]">
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 rounded-xl bg-[#8B5CF6] flex items-center justify-center flex-shrink-0">
          <ListChecks size={24} className="text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
          <p className="text-sm text-gray-300 leading-relaxed">{description}</p>
        </div>
      </div>

      {/* Metadata */}
      {(estimatedTime || stepCount) && (
        <div className="flex items-center gap-4 mb-4 text-sm text-gray-400">
          {estimatedTime && (
            <div className="flex items-center gap-1.5">
              <Clock size={14} />
              <span>{estimatedTime}</span>
            </div>
          )}
          {stepCount && (
            <div className="flex items-center gap-1.5">
              <ListChecks size={14} />
              <span>{stepCount} steps</span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBegin}
          className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-[#8B5CF6] text-white rounded-[18px] font-medium hover:bg-[#8B5CF6]/90 hover:scale-105 transition-all duration-200"
        >
          <span>Begin Workflow</span>
          <ChevronRight size={18} />
        </button>
        {onDecline && (
          <button
            onClick={onDecline}
            className="px-5 py-3 bg-[#3A3A45] text-white rounded-[18px] font-medium hover:bg-[#4A4A55] hover:scale-105 transition-all duration-200"
          >
            Just explain
          </button>
        )}
      </div>
    </div>
  );
}
