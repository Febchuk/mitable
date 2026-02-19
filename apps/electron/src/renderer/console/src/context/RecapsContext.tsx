/**
 * RecapsContext
 *
 * Stores created recaps in memory so they persist across navigation.
 * Recaps reference work blocks from the CalendarView data model.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { WorkBlock } from "../components/views/employee/CalendarView/types";

export type RecapDestination = "slack" | "gmail" | "linear" | "copy";

export interface RecapBlockSnapshot {
  id: string;
  startTime: Date;
  endTime: Date | null;
  duration: number;
  summary: string;
  goal?: string;
  isFocusedSession?: boolean;
}

export interface Recap {
  id: string;
  createdAt: Date;
  sentAt: Date;
  destination: RecapDestination;
  blocks: RecapBlockSnapshot[];
  totalDuration: number;
  content: string;
}

interface RecapsContextValue {
  recaps: Recap[];
  addRecap: (recap: Omit<Recap, "id" | "createdAt">) => Recap;
  deleteRecap: (id: string) => void;
  getRecap: (id: string) => Recap | undefined;
}

const RecapsContext = createContext<RecapsContextValue | null>(null);

/** Snapshot a WorkBlock into the lightweight shape stored in a recap */
export function snapshotBlock(block: WorkBlock): RecapBlockSnapshot {
  return {
    id: block.id,
    startTime: block.startTime,
    endTime: block.endTime,
    duration: block.duration,
    summary: block.summary,
    goal: block.goal,
    isFocusedSession: block.isFocusedSession,
  };
}

export function RecapsProvider({ children }: { children: ReactNode }) {
  const [recaps, setRecaps] = useState<Recap[]>([]);

  const addRecap = useCallback((data: Omit<Recap, "id" | "createdAt">) => {
    const recap: Recap = {
      ...data,
      id: `recap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date(),
    };
    setRecaps((prev) => [recap, ...prev]);
    return recap;
  }, []);

  const deleteRecap = useCallback((id: string) => {
    setRecaps((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const getRecap = useCallback(
    (id: string) => recaps.find((r) => r.id === id),
    [recaps]
  );

  return (
    <RecapsContext.Provider value={{ recaps, addRecap, deleteRecap, getRecap }}>
      {children}
    </RecapsContext.Provider>
  );
}

export function useRecaps() {
  const ctx = useContext(RecapsContext);
  if (!ctx) {
    throw new Error("useRecaps must be used within a RecapsProvider");
  }
  return ctx;
}
