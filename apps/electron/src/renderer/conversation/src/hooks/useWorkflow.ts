import { useState, useEffect } from "react";

export interface WorkflowStep {
  stepNumber: number;
  description: string;
  status: "pending" | "current" | "completed";
}

export interface WorkflowData {
  id: string;
  solution: string;
  solutionExplanation: string;
  currentStepIndex: number;
  status: "active" | "completed" | "cancelled";
  workflowData: {
    solution: string;
    solutionExplanation: string;
    searchQuery: string;
    stepList: WorkflowStep[];
    currentStepIndex: number;
    adjustmentHistory?: any[];
    supportingData?: any[];
    supportingDataExplanation?: string;
  };
}

export interface WorkflowInteraction {
  id: string;
  type: string;
  role: "user" | "assistant" | "system";
  content: string | null;
  relatedStepIndex: number | null;
  createdAt: string;
}

export interface WorkflowResponse {
  workflow: WorkflowData | null;
  interactions: WorkflowInteraction[];
}

/**
 * Hook to fetch active workflow data for a conversation
 * Polls every 2 seconds when workflow is active
 */
export function useWorkflow(conversationId: string, shouldPoll: boolean = true) {
  const [workflowData, setWorkflowData] = useState<WorkflowResponse>({
    workflow: null,
    interactions: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId || !shouldPoll) {
      console.log("[useWorkflow] Skipping fetch - no conversationId or polling disabled");
      return;
    }

    let interval: NodeJS.Timeout | null = null;

    const fetchWorkflow = async () => {
      try {
        setIsLoading(true);
        const url = `http://localhost:3000/api/workflows/conversation/${conversationId}/active`;
        console.log("[useWorkflow] Fetching workflow from:", url);

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Failed to fetch workflow: ${response.status}`);
        }

        const data: WorkflowResponse = await response.json();
        console.log("[useWorkflow] Received workflow data:", data);
        setWorkflowData(data);

        // Only stop polling if workflow is completed or cancelled
        // Keep polling slowly to detect new workflows
        if (
          data.workflow &&
          (data.workflow.status === "completed" || data.workflow.status === "cancelled")
        ) {
          console.log("[useWorkflow] Workflow finished, slowing down polling");
          return true; // Signal to slow down polling
        }

        return false; // Continue active polling
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        console.error("[useWorkflow] Error fetching workflow:", err);
        return false;
      } finally {
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchWorkflow().then((shouldSlowDown) => {
      if (!shouldSlowDown) {
        // Active workflow - poll every 2 seconds
        console.log("[useWorkflow] Starting active polling (2s interval)");
        interval = setInterval(async () => {
          const slowDown = await fetchWorkflow();
          if (slowDown && interval) {
            // Slow down to 10 second intervals to detect new workflows
            console.log("[useWorkflow] Switching to slow polling (10s interval)");
            clearInterval(interval);
            interval = setInterval(fetchWorkflow, 10000);
          }
        }, 2000);
      } else {
        // Finished workflow - poll every 10 seconds to detect new workflows
        console.log("[useWorkflow] Starting slow polling (10s interval)");
        interval = setInterval(fetchWorkflow, 10000);
      }
    });

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [conversationId]); // Only depend on conversationId, not workflowData

  return { workflowData, isLoading, error, refetch: () => {} };
}
