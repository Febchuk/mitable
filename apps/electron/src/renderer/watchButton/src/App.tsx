import { useState, useEffect } from 'react';

interface ButtonData {
  windowId: string;
  appName: string;
  windowTitle: string;
  isBlocked: boolean;
  blockReason?: string;
}

export default function App() {
  const [data, setData] = useState<ButtonData | null>(null);

  useEffect(() => {
    // Parse query params from URL
    const params = new URLSearchParams(window.location.search);
      const windowId = params.get('windowId');
      const appName = params.get('appName');
      const windowTitle = params.get('windowTitle');
    const isBlocked = params.get('isBlocked') === 'true';
    const blockReason = params.get('blockReason') || undefined;

      if (windowId && appName && windowTitle) {
        setData({ windowId, appName, windowTitle, isBlocked, blockReason });
        console.log('[WatchButton] Initialized with:', {
          windowId,
          appName,
          isBlocked,
          blockReason,
        });
    } else {
      console.error('[WatchButton] Missing required query params');
    }
  }, []);

  const handleClick = () => {
    if (data && !data.isBlocked) {
        console.log('[WatchButton] Button clicked - selecting window:', {
          windowId: data.windowId,
          appName: data.appName,
        });
        window.watchButtonAPI?.selectWindow({
          windowId: data.windowId,
          appName: data.appName,
          windowTitle: data.windowTitle,
        });
    }
  };

  if (!data) return null;

  return (
    <button
      onClick={handleClick}
      disabled={data.isBlocked}
      className={`
        px-3 py-2 rounded-md text-sm font-medium shadow-lg
        transition-all duration-200 app-no-drag
        ${
          data.isBlocked
            ? 'bg-gray-400 text-gray-700 cursor-not-allowed opacity-75'
            : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer hover:shadow-xl'
        }
      `}
        title={
          data.isBlocked
            ? data.blockReason
            : `Click to watch ${data.appName} - ${data.windowTitle}`
        }
    >
        {data.isBlocked ? 'Blocked - Contact Admin' : `Watch ${data.appName}`}
    </button>
  );
}
