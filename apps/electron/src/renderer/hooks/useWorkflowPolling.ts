import { useState, useEffect } from "react";

/**
 * Shared hook for workflow data fetching and polling
 * Used by both ChatDetail (console) and App (pill) to avoid duplicate polling
 */
export function useWorkflowPolling(messages: any[], conversationId: string | null) {
  const [workflowsData, setWorkflowsData] = useState<
    Map<string, { workflow: any; interactions: any[] }>
  >(new Map());

  // Initial fetch when messages change
  useEffect(() => {
    if (!messages.length) return;

    const fetchWorkflowData = async () => {
      // Find all workflow messages
      const workflowMessages = messages.filter(
        (msg: any) => msg.messageType === "workflow" && msg.workflowId
      );

      console.log("[useWorkflowPolling] Workflow messages found:", workflowMessages.length);

      if (!workflowMessages.length) return;

      // Extract unique workflow IDs that we haven't fetched yet
      const workflowIds = workflowMessages
        .map((msg: any) => msg.workflowId || msg.cardData?.workflowId)
        .filter((id: string | undefined) => id && !workflowsData.has(id));

      console.log("[useWorkflowPolling] Workflow IDs to fetch:", workflowIds);

      if (!workflowIds.length) {
        console.log("[useWorkflowPolling] All workflows already fetched");
        return;
      }

      try {
        const url = `http://localhost:3000/api/workflows/batch?ids=${workflowIds.join(",")}`;
        console.log("[useWorkflowPolling] Fetching from:", url);

        const response = await fetch(url);

        if (response.ok) {
          const data = await response.json();
          console.log("[useWorkflowPolling] Batch response:", data);

          const newWorkflowsData = new Map(workflowsData);

          data.workflows.forEach((item: { workflow: any; interactions: any[] }) => {
            console.log("[useWorkflowPolling] Mapping workflow:", item.workflow.id);
            newWorkflowsData.set(item.workflow.id, item);
          });

          setWorkflowsData(newWorkflowsData);
          console.log(
            "[useWorkflowPolling] Updated workflowsData map:",
            Array.from(newWorkflowsData.keys())
          );
        } else {
          console.error(
            "[useWorkflowPolling] Batch fetch failed:",
            response.status,
            await response.text()
          );
        }
      } catch (error) {
        console.error("[useWorkflowPolling] Failed to fetch workflows:", error);
      }
    };

    fetchWorkflowData();
  }, [messages]);

  // Poll for workflow updates every 2 seconds - ONLY for active workflows
  useEffect(() => {
    if (!conversationId || workflowsData.size === 0) return;

    // Check if any workflows are still active
    const hasActiveWorkflows = Array.from(workflowsData.values()).some(
      (data) => data.workflow.status === "active"
    );

    if (!hasActiveWorkflows) {
      console.log("[useWorkflowPolling] No active workflows - stopping polling");
      return;
    }

    console.log("[useWorkflowPolling] Starting polling for active workflows");

    const interval = setInterval(async () => {
      const workflowIds = Array.from(workflowsData.keys());

      try {
        const response = await fetch(
          `http://localhost:3000/api/workflows/batch?ids=${workflowIds.join(",")}`
        );

        if (response.ok) {
          const data = await response.json();
          const newWorkflowsData = new Map();

          data.workflows.forEach((item: { workflow: any; interactions: any[] }) => {
            newWorkflowsData.set(item.workflow.id, item);
          });

          setWorkflowsData(newWorkflowsData);

          // Check if all workflows are now complete/cancelled
          const stillHasActive = Array.from(newWorkflowsData.values()).some(
            (data) => data.workflow.status === "active"
          );

          if (!stillHasActive) {
            console.log("[useWorkflowPolling] All workflows finished - stopping polling");
            clearInterval(interval);
          }
        }
      } catch (error) {
        console.error("[useWorkflowPolling] Failed to poll workflows:", error);
      }
    }, 2000);

    return () => {
      console.log("[useWorkflowPolling] Cleanup - stopping polling");
      clearInterval(interval);
    };
  }, [conversationId, workflowsData.size]);

  return workflowsData;
}
