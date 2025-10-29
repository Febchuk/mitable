import React from "react";

const App: React.FC = () => {
  return (
    <div className="flex items-center justify-center h-full w-full">
      <div className="bg-black/85 backdrop-blur-sm rounded-[30px] px-6 py-4 shadow-2xl border border-white/10">
        <div className="flex items-center gap-3">
          {/* Spinner */}
          <div className="relative w-5 h-5">
            <div className="absolute inset-0 border-2 border-white/20 rounded-full"></div>
            <div className="absolute inset-0 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>

          {/* Status Text */}
          <p className="text-white text-sm font-medium">
            Looking at your screen...
          </p>
        </div>
      </div>
    </div>
  );
};

export default App;
