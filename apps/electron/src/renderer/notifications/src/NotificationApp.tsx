import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import LogoIcon from "@/assets/logo-icon.svg";
import { createLogger } from "../../lib/logger";

const logger = createLogger("NotificationApp");

interface NotificationAction {
  id: string;
  label: string;
  primary?: boolean;
}

interface NotificationConfig {
  title: string;
  message: string;
  icon?: string;
  actions: NotificationAction[];
  timeout?: number;
}

export default function NotificationApp() {
  const [config, setConfig] = useState<NotificationConfig | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  // Handle incoming notification data
  useEffect(() => {
    if (!window.notificationAPI) {
      logger.warn("notificationAPI not available");
      return;
    }

    const unsubscribe = window.notificationAPI.onData((data) => {
      logger.info("Received notification data", { title: data.title });
      setConfig(data);
      setIsVisible(true);
      setProgress(100);

      // Start auto-dismiss countdown if timeout is set
      if (data.timeout && data.timeout > 0) {
        const startTime = Date.now();
        const duration = data.timeout;

        // Update progress bar
        const progressInterval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
          setProgress(remaining);

          if (remaining <= 0) {
            clearInterval(progressInterval);
          }
        }, 50);

        // Auto-dismiss
        const id = setTimeout(() => {
          clearInterval(progressInterval);
          handleDismiss();
        }, duration);

        setTimeoutId(id);

        return () => {
          clearInterval(progressInterval);
          if (id) clearTimeout(id);
        };
      }
    });

    return unsubscribe;
  }, []);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    if (timeoutId) {
      clearTimeout(timeoutId);
      setTimeoutId(null);
    }
    // Notify main process
    window.notificationAPI?.close();
  }, [timeoutId]);

  const handleAction = useCallback(
    (actionId: string) => {
      logger.info("Action clicked", { actionId });
      if (timeoutId) {
        clearTimeout(timeoutId);
        setTimeoutId(null);
      }
      window.notificationAPI?.handleAction(actionId);
      setIsVisible(false);
    },
    [timeoutId]
  );

  if (!config || !isVisible) {
    return null;
  }

  return (
    <div
      className={`
        w-full h-full p-2
        transition-all duration-300 ease-out
        ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"}
      `}
    >
      <div className="bg-[#1a1a1a]/95 backdrop-blur-md rounded-xl shadow-2xl border border-white/10 overflow-hidden">
        {/* Header with close button */}
        <div className="flex items-start justify-between p-3 pb-2">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
              <img src={LogoIcon} alt="Mitable" className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="text-sm font-medium text-white leading-tight">{config.title}</h3>
              <p className="text-xs text-white/60 mt-0.5 leading-relaxed">{config.message}</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 transition-colors -mt-0.5 -mr-0.5"
          >
            <X size={12} className="text-white/40" />
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 px-3 pb-3">
          {config.actions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action.id)}
              className={`
                flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${
                  action.primary
                    ? "bg-[hsl(250,84%,65%)] hover:bg-[hsl(250,84%,60%)] text-white"
                    : "bg-white/10 hover:bg-white/15 text-white/80"
                }
              `}
            >
              {action.label}
            </button>
          ))}
        </div>

        {/* Progress bar for auto-dismiss */}
        {config.timeout && config.timeout > 0 && (
          <div className="h-0.5 bg-white/5">
            <div
              className="h-full bg-[hsl(250,84%,65%)]/50 transition-all duration-100 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
