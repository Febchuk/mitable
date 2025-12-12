import { useNavigate } from "react-router-dom";
import { FileText, Send, Clock, ChevronRight } from "lucide-react";
import { DEMO_DRAFT } from "@/console/src/data/demoDraft";

export default function DraftsView() {
  const navigate = useNavigate();
  const drafts = [DEMO_DRAFT]; // Hard-coded demo with single draft

  return (
    <div className="p-8 space-y-6 app-no-drag">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Your drafts</h1>
          <p className="text-text-secondary mt-1">
            Review and send your prepared updates
          </p>
        </div>
      </div>

      {/* Draft List */}
      {drafts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-background-elevated rounded-full flex items-center justify-center mb-4">
            <FileText size={32} className="text-text-tertiary" />
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">
            No drafts yet
          </h3>
          <p className="text-text-secondary max-w-sm">
            When Mitable prepares an update for you, it will appear here for
            review.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {drafts.map((draft) => (
            <div
              key={draft.id}
              onClick={() => navigate(`/drafts/${draft.id}`)}
              className="group bg-background-secondary border border-border-subtle rounded-lg p-4 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-background-elevated rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText size={20} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-text-primary text-base font-medium group-hover:text-white transition-colors truncate">
                      {draft.topic}
                    </h3>
                    <div className="flex items-center gap-2 text-text-tertiary text-sm mt-0.5">
                      <Send size={14} />
                      <span className="text-primary">{draft.recipient}</span>
                      <span className="text-text-tertiary">•</span>
                      <Clock size={14} />
                      <span>Ready to send</span>
                    </div>
                  </div>
                </div>
                <ChevronRight
                  size={20}
                  className="text-text-tertiary group-hover:text-text-secondary group-hover:translate-x-1 transition-all flex-shrink-0"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
