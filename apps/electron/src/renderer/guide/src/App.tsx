function App() {
  return (
    <div className="w-full h-full bg-background-primary text-text-primary p-md rounded-lg shadow-2xl">
      <header className="mb-md pb-md border-b border-background-tertiary">
        <h2 className="text-xl font-semibold">Step-by-Step Guide</h2>
      </header>

      <div className="space-y-md">
        <div className="p-sm bg-background-secondary rounded-md">
          <div className="flex items-center gap-sm mb-sm">
            <div className="w-6 h-6 rounded-full bg-accent-primary flex items-center justify-center text-xs">
              1
            </div>
            <span className="font-medium">Step 1</span>
          </div>
          <p className="text-sm text-text-secondary">Click the button in the top right corner</p>
        </div>

        <div className="p-sm bg-background-secondary rounded-md opacity-50">
          <div className="flex items-center gap-sm mb-sm">
            <div className="w-6 h-6 rounded-full bg-background-tertiary flex items-center justify-center text-xs">
              2
            </div>
            <span className="font-medium">Step 2</span>
          </div>
          <p className="text-sm text-text-secondary">Locked until step 1 is complete</p>
        </div>
      </div>

      <div className="mt-md pt-md border-t border-background-tertiary">
        <button className="w-full py-sm bg-accent-primary hover:bg-accent-secondary rounded-md transition-colors">
          Next Step
        </button>
      </div>
    </div>
  );
}

export default App;
