import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { Week } from "../types";
import { fetchRoadmap, toggleTaskCompletion } from "../services/roadmapService";
import { useUser } from "./UserContext";

interface RoadmapContextType {
  weeks: Week[];
  currentWeek: number;
  setCurrentWeek: (week: number) => void;
  toggleTask: (taskId: string) => void;
  loading: boolean;
  error: string | null;
}

const RoadmapContext = createContext<RoadmapContextType | undefined>(undefined);

export function RoadmapProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [currentWeek, setCurrentWeek] = useState(1);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch roadmap data when user is authenticated
  useEffect(() => {
    async function loadRoadmap() {
      if (!user) {
        // User not authenticated, skip fetching
        setWeeks([]);
        setCurrentWeek(1);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await fetchRoadmap();
        setWeeks(data.weeks);
        setCurrentWeek(data.currentWeek);
      } catch (err) {
        console.error("Failed to fetch roadmap:", err);
        setError(err instanceof Error ? err.message : "Failed to load roadmap");
      } finally {
        setLoading(false);
      }
    }

    loadRoadmap();
  }, [user]);

  const toggleTask = async (taskId: string) => {
    // Find the task to get its current completion status
    let currentCompleted = false;
    for (const week of weeks) {
      const task = week.tasks.find((t) => t.id === taskId);
      if (task) {
        currentCompleted = task.completed;
        break;
      }
    }

    // Optimistically update the UI
    setWeeks((prevWeeks) =>
      prevWeeks.map((week) => {
        // Update the task's completed status
        const updatedTasks = week.tasks.map((task) =>
          task.id === taskId ? { ...task, completed: !task.completed } : task
        );

        // Recalculate week percentage
        const completedCount = updatedTasks.filter((t) => t.completed).length;
        const totalCount = updatedTasks.length;
        const newPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

        return {
          ...week,
          tasks: updatedTasks,
          percentage: newPercentage,
        };
      })
    );

    // Make API call to persist the change
    try {
      await toggleTaskCompletion(taskId, !currentCompleted);
    } catch (err) {
      console.error("Failed to toggle task:", err);
      // Revert the optimistic update on error
      setWeeks((prevWeeks) =>
        prevWeeks.map((week) => {
          const revertedTasks = week.tasks.map((task) =>
            task.id === taskId ? { ...task, completed: currentCompleted } : task
          );

          const completedCount = revertedTasks.filter((t) => t.completed).length;
          const totalCount = revertedTasks.length;
          const newPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

          return {
            ...week,
            tasks: revertedTasks,
            percentage: newPercentage,
          };
        })
      );
      setError(err instanceof Error ? err.message : "Failed to update task");
    }
  };

  return (
    <RoadmapContext.Provider value={{ weeks, currentWeek, setCurrentWeek, toggleTask, loading, error }}>
      {children}
    </RoadmapContext.Provider>
  );
}

export function useRoadmap() {
  const context = useContext(RoadmapContext);
  if (!context) {
    throw new Error("useRoadmap must be used within a RoadmapProvider");
  }
  return context;
}
