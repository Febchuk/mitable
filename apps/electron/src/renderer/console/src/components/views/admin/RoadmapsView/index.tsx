export default function RoadmapsView() {
  return (
    <div className="p-8 space-y-6 app-no-drag">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold text-white">Roadmaps</h1>
        <button className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors">
          Create Roadmap
        </button>
      </div>

      {/* Roadmaps Grid Placeholder */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-bg-tertiary rounded-lg border border-white/10 p-6">
          <p className="text-text-secondary text-center">Roadmap templates will be displayed here</p>
        </div>
      </div>
    </div>
  );
}
