export default function PeopleView() {
  return (
    <div className="p-8 space-y-6 app-no-drag">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold text-white">People</h1>
        <button className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors">
          Add New User
        </button>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search people..."
            className="w-full px-4 py-2 bg-bg-tertiary text-white rounded-md border border-white/10 focus:border-primary focus:outline-none"
          />
        </div>
        <button className="px-4 py-2 bg-bg-tertiary text-white rounded-md border border-white/10 hover:bg-white/10 transition-colors">
          Filter
        </button>
      </div>

      {/* People Table Placeholder */}
      <div className="bg-bg-tertiary rounded-lg border border-white/10 p-6">
        <p className="text-text-secondary text-center">People table will be displayed here</p>
      </div>
    </div>
  );
}
