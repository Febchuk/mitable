function App() {
  return (
    <div className="w-full h-full pointer-events-none">
      {/* Overlay content will be rendered here dynamically */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-accent-primary text-sm opacity-50">
        Overlay Window
      </div>
    </div>
  );
}

export default App;
