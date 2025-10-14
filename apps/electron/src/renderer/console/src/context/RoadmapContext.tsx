import { createContext, useContext, useState, ReactNode } from "react";
import type { Week } from "../types";

interface RoadmapContextType {
  weeks: Week[];
  currentWeek: number;
  setCurrentWeek: (week: number) => void;
  toggleTask: (taskId: string) => void;
}

const RoadmapContext = createContext<RoadmapContextType | undefined>(undefined);

export function RoadmapProvider({ children }: { children: ReactNode }) {
  const [currentWeek, setCurrentWeek] = useState(1);
  const [weeks, setWeeks] = useState<Week[]>([
    {
      number: 1,
      percentage: 71,
      tasks: [
        {
          id: "1-1",
          title: "Set up development environment",
          timeEstimate: "1 hour",
          completed: true,
          week: 1,
        },
        {
          id: "1-2",
          title: "Get access to GitHub, AWS and internal tools",
          timeEstimate: "2 hours",
          completed: true,
          week: 1,
        },
        {
          id: "1-3",
          title: "Review Lorikeet Architecture Overview",
          timeEstimate: "1.5 hours",
          completed: true,
          week: 1,
        },
        {
          id: "1-4",
          title: "Clone repositories and run local setup",
          timeEstimate: "1h 15m",
          completed: true,
          isActive: true,
          week: 1,
        },
        {
          id: "1-5",
          title: "Complete security and compliance training",
          timeEstimate: "1 hour",
          completed: true,
          week: 1,
        },
        {
          id: "1-6",
          title: "Shadow a customer deployment call",
          timeEstimate: "1 hour",
          completed: false,
          week: 1,
        },
        {
          id: "1-7",
          title: "Integrate Lorikeet API with test customer",
          timeEstimate: "1 hour",
          completed: false,
          week: 1,
        },
      ],
    },
    {
      number: 2,
      percentage: 20,
      tasks: [],
    },
    {
      number: 3,
      percentage: 0,
      tasks: [],
    },
    {
      number: 4,
      percentage: 0,
      tasks: [],
    },
    {
      number: 5,
      percentage: 0,
      tasks: [],
    },
  ]);

  const toggleTask = (taskId: string) => {
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
  };

  return (
    <RoadmapContext.Provider value={{ weeks, currentWeek, setCurrentWeek, toggleTask }}>
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
