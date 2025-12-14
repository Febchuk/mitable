import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { SelectedWindowInfo } from "@mitable/shared";

export interface Session {
  id: string;
  name: string;
  createdAt: Date;
  selectedWindows: SelectedWindowInfo[];
  isActive: boolean;
}

interface SessionsContextType {
  sessions: Session[];
  createSession: (selectedWindows: SelectedWindowInfo[]) => Session;
  getSession: (id: string) => Session | undefined;
  endActiveSession: () => void;
}

const SessionsContext = createContext<SessionsContextType | undefined>(undefined);

export function SessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>([]);

  const formatSessionName = (date: Date): string => {
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const endActiveSession = useCallback(() => {
    setSessions((prev) =>
      prev.map((session) => ({ ...session, isActive: false }))
    );
  }, []);

  const createSession = useCallback(
    (selectedWindows: SelectedWindowInfo[]): Session => {
      // End any existing active session
      endActiveSession();

      const now = new Date();
      const newSession: Session = {
        id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: formatSessionName(now),
        createdAt: now,
        selectedWindows,
        isActive: true,
      };

      setSessions((prev) => [newSession, ...prev]);
      return newSession;
    },
    [endActiveSession]
  );

  const getSession = useCallback(
    (id: string): Session | undefined => {
      return sessions.find((session) => session.id === id);
    },
    [sessions]
  );

  return (
    <SessionsContext.Provider
      value={{
        sessions,
        createSession,
        getSession,
        endActiveSession,
      }}
    >
      {children}
    </SessionsContext.Provider>
  );
}

export function useSessions() {
  const context = useContext(SessionsContext);
  if (context === undefined) {
    throw new Error("useSessions must be used within a SessionsProvider");
  }
  return context;
}

