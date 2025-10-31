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
        
        // Stop polling if workflow is completed or cancelled
        if (data.workflow && (data.workflow.status === "completed" || data.workflow.status === "cancelled")) {
          console.log("[useWorkflow] Workflow finished, stopping polling");
          return true; // Signal to stop polling
        }
        
        return false; // Continue polling
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        console.error("[useWorkflow] Error fetching workflow:", err);
        return false;
      } finally {
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchWorkflow().then((shouldStop) => {
      // Only start polling if workflow is active
      if (!shouldStop) {
        console.log("[useWorkflow] Starting polling for active workflow");
        interval = setInterval(async () => {
          const stop = await fetchWorkflow();
          if (stop && interval) {
            console.log("[useWorkflow] Clearing interval");
            clearInterval(interval);
            interval = null;
          }
        }, 2000);
      } else {
        console.log("[useWorkflow] Workflow already finished, not starting poll");
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
