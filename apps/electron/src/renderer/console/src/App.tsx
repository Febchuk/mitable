function App() {
  return (
    <div className="w-full h-full bg-background-primary text-text-primary p-lg">
      <header className="mb-lg">
        <h1 className="text-3xl font-bold mb-sm">Mitable Console</h1>
        <p className="text-text-secondary">Your AI Onboarding Companion</p>
      </header>

      <div className="grid grid-cols-3 gap-md">
        <button className="p-md bg-background-tertiary rounded-md hover:bg-accent-primary transition-colors">
          <h3 className="font-semibold mb-sm">Roadmap</h3>
          <p className="text-sm text-text-secondary">View your onboarding path</p>
        </button>

        <button className="p-md bg-background-tertiary rounded-md hover:bg-accent-primary transition-colors">
          <h3 className="font-semibold mb-sm">Nudges</h3>
          <p className="text-sm text-text-secondary">Expert recommendations</p>
        </button>

        <button className="p-md bg-background-tertiary rounded-md hover:bg-accent-primary transition-colors">
          <h3 className="font-semibold mb-sm">Chats</h3>
          <p className="text-sm text-text-secondary">Help conversations</p>
        </button>
      </div>

      <div className="mt-lg p-md bg-background-secondary rounded-md">
        <p className="text-text-secondary text-center">Press Cmd+H for help anywhere</p>
      </div>
    </div>
  );
}

export default App;
