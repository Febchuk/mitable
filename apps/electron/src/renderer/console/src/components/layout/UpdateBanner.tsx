import { useUpdate } from "../../context/UpdateContext";
import { AnimatePresence, motion } from "framer-motion";

export default function UpdateBanner() {
  const {
    updateState,
    updateInfo,
    downloadProgress,
    isBannerDismissed,
    dismissBanner,
    downloadUpdate,
    installUpdate,
  } = useUpdate();

  const isVisible =
    !isBannerDismissed &&
    (updateState === "available" || updateState === "downloading" || updateState === "downloaded");

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2 bg-indigo/10 border-b border-indigo/20 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 text-indigo">
                {updateState === "downloaded" ? (
                  <CheckCircleIcon />
                ) : updateState === "downloading" ? (
                  <SpinnerIcon />
                ) : (
                  <ArrowDownIcon />
                )}
              </span>

              <span className="text-text-primary truncate">
                {updateState === "downloaded" && (
                  <>v{updateInfo?.version} ready &mdash; restart to apply</>
                )}
                {updateState === "downloading" && (
                  <>
                    Downloading v{updateInfo?.version}
                    {downloadProgress ? ` (${Math.round(downloadProgress.percent)}%)` : "..."}
                  </>
                )}
                {updateState === "available" && <>v{updateInfo?.version} available</>}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-3">
              {updateState === "available" && (
                <button
                  onClick={downloadUpdate}
                  className="px-3 py-1 rounded-md text-xs font-medium bg-indigo text-white hover:bg-indigo/90 transition-colors"
                >
                  Download
                </button>
              )}
              {updateState === "downloaded" && (
                <button
                  onClick={installUpdate}
                  className="px-3 py-1 rounded-md text-xs font-medium bg-indigo text-white hover:bg-indigo/90 transition-colors"
                >
                  Restart
                </button>
              )}
              <button
                onClick={dismissBanner}
                className="p-1 rounded hover:bg-white/10 transition-colors text-text-secondary hover:text-text-primary"
                aria-label="Dismiss"
              >
                <XIcon />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ArrowDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
