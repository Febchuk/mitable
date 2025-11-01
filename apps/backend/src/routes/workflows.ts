import { Router } from "express";
import { workflowService } from "../services/workflow.service";

const router = Router();

/**
 * Get multiple workflows by IDs (batch)
 * GET /api/workflows/batch?ids=id1,id2,id3
 */
router.get("/batch", async (req, res) => {
  try {
    const idsParam = req.query.ids as string;

    if (!idsParam) {
      return res.status(400).json({ error: "ids parameter is required" });
    }

    const workflowIds = idsParam.split(",").map((id) => id.trim());
    console.log("[WorkflowRoutes] 📥 GET batch workflows:", workflowIds);

    // Fetch all workflows and their interactions in parallel
    const results = await Promise.all(
      workflowIds.map(async (workflowId) => {
        try {
          const workflow = await workflowService.getWorkflowById(workflowId);
          if (!workflow) {
            return null;
          }
          const interactions = await workflowService.getInteractions(workflow.id);
          return { workflow, interactions };
        } catch (error) {
          console.error(`[WorkflowRoutes] Error fetching workflow ${workflowId}:`, error);
          return null;
        }
      })
    );

    // Filter out nulls (workflows that weren't found)
    const workflows = results.filter((result) => result !== null);

    console.log(
      `[WorkflowRoutes] ✅ Fetched ${workflows.length} of ${workflowIds.length} workflows`
    );

    res.json({ workflows });
  } catch (error) {
    console.error("[WorkflowRoutes] ❌ Error fetching batch workflows:", error);
    res.status(500).json({
      error: "Failed to fetch workflows",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get single workflow by ID
 * GET /api/workflows/:workflowId
 */
router.get("/:workflowId", async (req, res) => {
  try {
    const { workflowId } = req.params;
    console.log("[WorkflowRoutes] 📥 GET workflow by ID:", workflowId);

    const workflow = await workflowService.getWorkflowById(workflowId);

    if (!workflow) {
      console.log("[WorkflowRoutes] ❌ Workflow not found");
      return res.status(404).json({ error: "Workflow not found" });
    }

    const interactions = await workflowService.getInteractions(workflow.id);

    res.json({
      workflow,
      interactions,
    });
  } catch (error) {
    console.error("[WorkflowRoutes] ❌ Error fetching workflow:", error);
    res.status(500).json({
      error: "Failed to fetch workflow",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get all workflows for a conversation (for chat history)
 * GET /api/workflows/conversation/:conversationId/all
 */
router.get("/conversation/:conversationId/all", async (req, res) => {
  try {
    const { conversationId } = req.params;
    console.log("[WorkflowRoutes] 📥 GET all workflows for conversation:", conversationId);

    const workflows = await workflowService.getAllWorkflowsForConversation(conversationId);

    console.log(`[WorkflowRoutes] ✅ Found ${workflows.length} workflows`);

    // Get interactions for each workflow
    const workflowsWithInteractions = await Promise.all(
      workflows.map(async (workflow) => {
        const interactions = await workflowService.getInteractions(workflow.id);
        return { workflow, interactions };
      })
    );

    res.json({ workflows: workflowsWithInteractions });
  } catch (error) {
    console.error("[WorkflowRoutes] ❌ Error fetching workflows:", error);
    res.status(500).json({
      error: "Failed to fetch workflows",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get most recent workflow for a conversation (for UI display)
 * GET /api/workflows/conversation/:conversationId/active
 */
router.get("/conversation/:conversationId/active", async (req, res) => {
  try {
    const { conversationId } = req.params;
    console.log("[WorkflowRoutes] 📥 GET workflow for conversation:", conversationId);

    // Use getMostRecentWorkflow to show history (including completed/cancelled)
    const workflow = await workflowService.getMostRecentWorkflow(conversationId);

    if (!workflow) {
      console.log("[WorkflowRoutes] ❌ No workflow found");
      return res.json({ workflow: null, interactions: [] });
    }

    console.log(`[WorkflowRoutes] ✅ Workflow found (${workflow.status}):`, {
      id: workflow.id,
      solution: workflow.solution,
      status: workflow.status,
      currentStepIndex: workflow.currentStepIndex,
      hasWorkflowData: !!workflow.workflowData,
      workflowDataType: typeof workflow.workflowData,
      workflowDataKeys: workflow.workflowData ? Object.keys(workflow.workflowData) : [],
      stepListLength: workflow.workflowData?.stepList?.length,
    });

    // Get all interactions for this workflow
    const interactions = await workflowService.getInteractions(workflow.id);
    console.log("[WorkflowRoutes] 📝 Found interactions:", interactions.length);

    res.json({
      workflow: workflow,
      interactions: interactions,
    });
  } catch (error) {
    console.error("[WorkflowRoutes] ❌ Error fetching workflow:", error);
    res.status(500).json({
      error: "Failed to fetch workflow",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get workflow history for a user
 * GET /api/workflows/user/:userId/history
 */
router.get("/user/:userId/history", async (req, res) => {
  try {
    const { userId } = req.params;
    const organizationId = req.query.organizationId as string;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!organizationId) {
      return res.status(400).json({ error: "organizationId is required" });
    }

    const workflows = await workflowService.getUserWorkflowHistory(userId, organizationId, limit);

    res.json({ workflows });
  } catch (error) {
    console.error("[WorkflowRoutes] Error fetching workflow history:", error);
    res.status(500).json({
      error: "Failed to fetch workflow history",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Cancel/Exit a workflow
 * POST /api/workflows/:workflowId/cancel
 */
router.post("/:workflowId/cancel", async (req, res) => {
  try {
    const { workflowId } = req.params;

    const cancelledWorkflow = await workflowService.cancelWorkflow(workflowId);

    res.json({
      message: "Workflow cancelled successfully",
      workflow: cancelledWorkflow,
    });
  } catch (error) {
    console.error("[WorkflowRoutes] Error cancelling workflow:", error);
    res.status(500).json({
      error: "Failed to cancel workflow",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
