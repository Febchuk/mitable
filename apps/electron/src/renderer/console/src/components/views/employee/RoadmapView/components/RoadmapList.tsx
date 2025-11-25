import { Search, MapIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { useRoadmap } from "@/console/src/hooks/queries/roadmap";

interface RoadmapListProps {
  selectedRoadmapId: string | null;
  onSelectRoadmap: (id: string) => void;
}

export default function RoadmapList({ selectedRoadmapId, onSelectRoadmap }: RoadmapListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: roadmap, isLoading } = useRoadmap();

  // Build roadmap list from the fetched data
  const roadmaps = roadmap ? [{
    id: "onboarding",
    title: "Onboarding Roadmap",
    description: "Your first 90 days at Mitable",
    progress: calculateProgress(roadmap),
    completedTasks: calculateCompletedTasks(roadmap),
    totalTasks: calculateTotalTasks(roadmap),
    dueDate: calculateDueDate(roadmap),
    status: roadmap.status === "active" ? "in_progress" as const : "not_started" as const,
  }] : [];

  // Auto-select first roadmap when it loads
  useEffect(() => {
    if (!selectedRoadmapId && roadmaps.length > 0) {
      onSelectRoadmap(roadmaps[0].id);
    }
  }, [roadmaps.length, selectedRoadmapId, onSelectRoadmap]);

  const filteredRoadmaps = roadmaps.filter((roadmap) =>
    roadmap.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-96 border-r border-primary/20 bg-[#0f0d15] flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-primary/20 space-y-4">
        <div className="flex items-center gap-3">
          <MapIcon className="w-6 h-6 text-purple-400" />
          <h2 className="text-xl font-bold text-white">My Roadmaps</h2>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
            size={16}
          />
          <Input
            placeholder="Search roadmaps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-black/20 border-white/10 text-sm focus:border-primary/50 focus:ring-primary/20 placeholder:text-white/30"
          />
        </div>
      </div>

      {/* Roadmap List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="p-6 text-center">
            <div className="w-8 h-8 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-text-secondary text-sm">Loading roadmaps...</p>
          </div>
        ) : filteredRoadmaps.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-text-secondary text-sm">
              {searchQuery ? "No roadmaps found" : "No roadmaps assigned yet"}
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {filteredRoadmaps.map((roadmap) => {
              const isSelected = selectedRoadmapId === roadmap.id;

              return (
                <button
                  key={roadmap.id}
                  onClick={() => onSelectRoadmap(roadmap.id)}
                  className={`
                    w-full text-left p-4 rounded-xl transition-all duration-200
                    ${
                      isSelected
                        ? "bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-2 border-primary shadow-lg shadow-primary/20"
                        : "bg-[#1a1625] border border-primary/10 hover:border-primary/30 hover:bg-[#231d2e]"
                    }
                  `}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-white font-semibold text-base flex-1 line-clamp-2">
                      {roadmap.title}
                    </h3>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        roadmap.status === "in_progress"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-gray-500/20 text-gray-400"
                      }`}
                    >
                      {roadmap.status === "in_progress" ? "Active" : "Not Started"}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-text-secondary text-xs mb-3 line-clamp-2">
                    {roadmap.description}
                  </p>

                  {/* Task Counter */}
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-text-tertiary">Tasks</span>
                    <span className="text-text-secondary font-medium">
                      {roadmap.completedTasks} of {roadmap.totalTasks} completed
                    </span>
                  </div>

                  {/* Due Date */}
                  <div className="text-xs text-text-tertiary">
                    Due: {roadmap.dueDate}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper functions
function calculateProgress(roadmap: any): number {
  const allTasks = roadmap.weeks.flatMap((w: any) => w.tasks);
  const completedTasks = allTasks.filter((t: any) => t.completed).length;
  const totalTasks = allTasks.length;
  return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
}

function calculateCompletedTasks(roadmap: any): number {
  const allTasks = roadmap.weeks.flatMap((w: any) => w.tasks);
  return allTasks.filter((t: any) => t.completed).length;
}

function calculateTotalTasks(roadmap: any): number {
  const allTasks = roadmap.weeks.flatMap((w: any) => w.tasks);
  return allTasks.length;
}

function calculateDueDate(roadmap: any): string {
  // Assume 90 days from now or based on total weeks
  const totalWeeks = roadmap.totalWeeks || 12;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (totalWeeks * 7));
  return dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
