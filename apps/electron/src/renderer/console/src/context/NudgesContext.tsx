import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Nudge } from "../types";
import {
  fetchNudges,
  acceptNudge as acceptNudgeAPI,
  dismissNudge as dismissNudgeAPI,
} from "../services/nudgesService";
import { useUser } from "./UserContext";

interface NudgesContextType {
  nudges: Nudge[];
  acceptNudge: (nudgeId: string) => void;
  dismissNudge: (nudgeId: string) => void;
  loading: boolean;
  error: string | null;
}

const NudgesContext = createContext<NudgesContextType | undefined>(undefined);

export function NudgesProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch nudges when user is authenticated
  useEffect(() => {
    async function loadNudges() {
      if (!user) {
        // User not authenticated, skip fetching
        setNudges([]);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await fetchNudges();

        // Parse date strings to Date objects and cast status
        const nudgesWithDates = data.nudges.map((nudge) => ({
          ...nudge,
          timestamp: new Date(nudge.timestamp),
          acceptedAt: nudge.acceptedAt ? new Date(nudge.acceptedAt) : null,
          resolvedAt: nudge.resolvedAt ? new Date(nudge.resolvedAt) : null,
          status: nudge.status as "waiting" | "accepted" | "declined" | "resolved",
        }));

        setNudges(nudgesWithDates);
      } catch (err) {
        console.error("Failed to fetch nudges:", err);
        setError(err instanceof Error ? err.message : "Failed to load nudges");
      } finally {
        setLoading(false);
      }
    }

    loadNudges();
  }, [user]);

  const acceptNudge = async (nudgeId: string) => {
    // Optimistically update UI
    setNudges((prev) =>
      prev.map((nudge) =>
        nudge.id === nudgeId ? { ...nudge, status: "accepted" as const } : nudge
      )
    );

    try {
      await acceptNudgeAPI(nudgeId);
    } catch (err) {
      console.error("Failed to accept nudge:", err);
      // Revert on error
      setNudges((prev) =>
        prev.map((nudge) =>
          nudge.id === nudgeId ? { ...nudge, status: "waiting" as const } : nudge
        )
      );
      setError(err instanceof Error ? err.message : "Failed to accept nudge");
    }
  };

  const dismissNudge = async (nudgeId: string) => {
    // Optimistically update UI
    const previousNudges = [...nudges];
    setNudges((prev) => prev.filter((nudge) => nudge.id !== nudgeId));

    try {
      await dismissNudgeAPI(nudgeId);
    } catch (err) {
      console.error("Failed to dismiss nudge:", err);
      // Revert on error
      setNudges(previousNudges);
      setError(err instanceof Error ? err.message : "Failed to dismiss nudge");
    }
  };

  return (
    <NudgesContext.Provider value={{ nudges, acceptNudge, dismissNudge, loading, error }}>
      {children}
    </NudgesContext.Provider>
  );
}

export function useNudges() {
  const context = useContext(NudgesContext);
  if (!context) {
    throw new Error("useNudges must be used within NudgesProvider");
  }
  return context;
}
