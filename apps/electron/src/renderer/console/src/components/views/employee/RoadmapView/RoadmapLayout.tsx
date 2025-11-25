import { useState } from "react";
import RoadmapList from "./components/RoadmapList";
import RoadmapDetail from "./components/RoadmapDetail";

export default function RoadmapLayout() {
  const [selectedRoadmapId, setSelectedRoadmapId] = useState<string | null>(null);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0810]">
      {/* Middle Panel: Roadmap List */}
      <RoadmapList
        selectedRoadmapId={selectedRoadmapId}
        onSelectRoadmap={setSelectedRoadmapId}
      />

      {/* Right Panel: Roadmap Detail */}
      <div className="flex-1">
        {selectedRoadmapId ? (
          <RoadmapDetail roadmapId={selectedRoadmapId} />
        ) : (
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center space-y-4">
              <div className="w-24 h-24 bg-gradient-purple-blue rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-primary/30">
                <span className="text-5xl">🗺️</span>
              </div>
              <h2 className="text-2xl font-bold text-white">Select a Roadmap</h2>
              <p className="text-text-secondary">
                Choose a roadmap from the list to view your onboarding journey
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
