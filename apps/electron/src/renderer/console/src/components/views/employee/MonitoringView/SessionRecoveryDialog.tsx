/**
 * Session Recovery Dialog
 * Shown when incomplete monitoring sessions are detected on app startup
 */

import React, { useState } from "react";
import { Clock, AlertTriangle, RefreshCw, Trash2, CheckCircle, XCircle } from "lucide-react";

interface RecoverySession {
  sessionId: string;
  sessionGoal?: string;
  frameCount: number;
  lastFrameTimestamp: string;
  checkpointAt: string;
  duration: string;
  localPath: string;
}

interface SessionRecoveryDialogProps {
  sessions: RecoverySession[];
  onRecover: (sessionId: string) => Promise<void>;
  onDiscard: (sessionId: string) => Promise<void>;
  onRecoverAll: () => Promise<void>;
  onDiscardAll: () => Promise<void>;
  onClose: () => void;
}

export const SessionRecoveryDialog: React.FC<SessionRecoveryDialogProps> = ({
  sessions,
  onRecover,
  onDiscard,
  onRecoverAll,
  onDiscardAll,
  onClose,
}) => {
  const [processing, setProcessing] = useState<Record<string, "recovering" | "discarding">>({});
  const [completed, setCompleted] = useState<Record<string, "recovered" | "discarded">>({});
  const [isProcessingAll, setIsProcessingAll] = useState(false);

  const handleRecover = async (sessionId: string) => {
    setProcessing((prev) => ({ ...prev, [sessionId]: "recovering" }));
    try {
      await onRecover(sessionId);
      setCompleted((prev) => ({ ...prev, [sessionId]: "recovered" }));
    } finally {
      setProcessing((prev) => {
        const newState = { ...prev };
        delete newState[sessionId];
        return newState;
      });
    }
  };

  const handleDiscard = async (sessionId: string) => {
    setProcessing((prev) => ({ ...prev, [sessionId]: "discarding" }));
    try {
      await onDiscard(sessionId);
      setCompleted((prev) => ({ ...prev, [sessionId]: "discarded" }));
    } finally {
      setProcessing((prev) => {
        const newState = { ...prev };
        delete newState[sessionId];
        return newState;
      });
    }
  };

  const handleRecoverAll = async () => {
    setIsProcessingAll(true);
    try {
      await onRecoverAll();
      sessions.forEach((s) => {
        setCompleted((prev) => ({ ...prev, [s.sessionId]: "recovered" }));
      });
    } finally {
      setIsProcessingAll(false);
    }
  };

  const handleDiscardAll = async () => {
    setIsProcessingAll(true);
    try {
      await onDiscardAll();
      sessions.forEach((s) => {
        setCompleted((prev) => ({ ...prev, [s.sessionId]: "discarded" }));
      });
    } finally {
      setIsProcessingAll(false);
    }
  };

  const allCompleted = sessions.every((s) => completed[s.sessionId]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-neutral-900 rounded-xl shadow-2xl border border-neutral-800 w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Session Recovery</h2>
            <p className="text-sm text-neutral-400">
              {sessions.length} incomplete session{sessions.length > 1 ? "s" : ""} found
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-80 overflow-y-auto">
          <p className="text-sm text-neutral-400 mb-4">
            These sessions were interrupted unexpectedly. You can recover them to continue where you
            left off, or discard to delete the captured data.
          </p>

          <div className="space-y-3">
            {sessions.map((session) => {
              const isProcessing = !!processing[session.sessionId];
              const status = completed[session.sessionId];

              return (
                <div
                  key={session.sessionId}
                  className={`p-4 rounded-lg border transition-colors ${
                    status === "recovered"
                      ? "bg-green-500/5 border-green-500/20"
                      : status === "discarded"
                        ? "bg-red-500/5 border-red-500/20"
                        : "bg-neutral-800/50 border-neutral-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {status === "recovered" && (
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        )}
                        {status === "discarded" && (
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium text-white truncate">
                          {session.sessionGoal || "Untitled Session"}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-neutral-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {session.duration}
                        </span>
                        <span>{session.frameCount} frames</span>
                        <span>Last: {formatTime(session.lastFrameTimestamp)}</span>
                      </div>
                    </div>

                    {!status && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleRecover(session.sessionId)}
                          disabled={isProcessing || isProcessingAll}
                          className="p-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20
                                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Recover session"
                        >
                          {processing[session.sessionId] === "recovering" ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDiscard(session.sessionId)}
                          disabled={isProcessing || isProcessingAll}
                          className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20
                                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Discard session"
                        >
                          {processing[session.sessionId] === "discarding" ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between">
          {!allCompleted && sessions.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleRecoverAll}
                disabled={isProcessingAll || Object.keys(processing).length > 0}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-500/10 text-blue-400
                         hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Recover All
              </button>
              <button
                onClick={handleDiscardAll}
                disabled={isProcessingAll || Object.keys(processing).length > 0}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-red-500/10 text-red-400
                         hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Discard All
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            disabled={isProcessingAll || Object.keys(processing).length > 0}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-neutral-800 text-white
                     hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ml-auto"
          >
            {allCompleted ? "Done" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
};
