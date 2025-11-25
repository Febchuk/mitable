import { useState } from "react";
import NudgeList from "./components/NudgeList";
import NudgeDetail from "./NudgeDetail";

export default function NudgesLayout() {
  const [selectedNudgeId, setSelectedNudgeId] = useState<string | null>(null);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0810]">
      {/* Middle Panel: Nudge List */}
      <NudgeList
        selectedNudgeId={selectedNudgeId}
        onSelectNudge={setSelectedNudgeId}
      />

      {/* Right Panel: Nudge Detail */}
      <div className="flex-1">
        {selectedNudgeId ? (
          <NudgeDetail nudgeId={selectedNudgeId} />
        ) : (
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center space-y-4">
              <div className="w-24 h-24 bg-gradient-purple-blue rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-primary/30">
                <span className="text-5xl">👋</span>
              </div>
              <h2 className="text-2xl font-bold text-white">Select a Nudge</h2>
              <p className="text-text-secondary">
                Choose a nudge from the list to view details and responses
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
