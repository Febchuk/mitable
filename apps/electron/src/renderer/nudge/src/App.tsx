function App() {
  return (
    <div className="w-full h-full bg-background-primary text-text-primary p-md rounded-lg shadow-2xl">
      <header className="mb-md pb-md border-b border-background-tertiary">
        <h2 className="text-xl font-semibold">Expert Match</h2>
        <p className="text-sm text-text-secondary mt-xs">We found someone who can help</p>
      </header>

      <div className="mb-md">
        <div className="flex items-center gap-md mb-md">
          <div className="w-12 h-12 rounded-full bg-accent-primary flex items-center justify-center text-xl">
            👤
          </div>
          <div>
            <h3 className="font-semibold">Sarah Johnson</h3>
            <p className="text-sm text-text-secondary">Senior Engineer • Engineering</p>
          </div>
        </div>

        <div className="space-y-sm">
          <div className="flex items-center gap-sm text-sm">
            <span className="text-text-secondary">Response Rate:</span>
            <div className="flex-1 h-2 bg-background-tertiary rounded-full overflow-hidden">
              <div className="h-full w-4/5 bg-accent-primary"></div>
            </div>
            <span>95%</span>
          </div>

          <div className="flex items-center gap-sm text-sm">
            <span className="text-text-secondary">Match Score:</span>
            <div className="flex-1 h-2 bg-background-tertiary rounded-full overflow-hidden">
              <div className="h-full w-11/12 bg-accent-primary"></div>
            </div>
            <span>92%</span>
          </div>
        </div>
      </div>

      <div className="space-y-sm">
        <button className="w-full py-sm bg-accent-primary hover:bg-accent-secondary rounded-md transition-colors">
          Connect with Sarah
        </button>
        <button className="w-full py-sm bg-background-tertiary hover:bg-background-secondary rounded-md transition-colors">
          Show Other Experts
        </button>
      </div>
    </div>
  );
}

export default App;
