export default function DashboardView() {
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="p-8 pb-0">
        <h1 className="text-4xl font-bold text-text-primary">Dashboard</h1>
      </div>

      {/* Centered Placeholder Message */}
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-text-secondary text-xl text-center max-w-2xl leading-relaxed">
          Data drives your business—we get it. That's why we've reserved this prime real estate for
          your dashboard. As your team uses Mitable, you'll see business impact insights appear
          here.
        </p>
      </div>
    </div>
  );
}
