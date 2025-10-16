import { apiRequest } from "./api";

export interface RoadmapTask {
  id: string;
  title: string;
  description?: string;
  timeEstimate: string;
  completed: boolean;
  completedAt?: Date | null;
  week: number;
  orderIndex?: number;
}

export interface Week {
  number: number;
  percentage: number;
  tasks: RoadmapTask[];
}

export interface RoadmapResponse {
  weeks: Week[];
  currentWeek: number;
  totalWeeks: number;
  status?: string;
}

/**
 * Fetch the user's roadmap with all weeks and tasks
 */
export async function fetchRoadmap(): Promise<RoadmapResponse> {
  return apiRequest<RoadmapResponse>("/roadmaps");
}

/**
 * Toggle a task's completion status
 */
export async function toggleTaskCompletion(
  taskId: string,
  completed: boolean
): Promise<{
  success: boolean;
  task: { id: string; completed: boolean; completedAt: Date | null };
}> {
  return apiRequest(`/roadmaps/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({ completed }),
  });
}
