import { Router } from "express";
import { workflowService } from "../services/workflow.service";

const router = Router();

/**
 * Get active workflow for a conversation
 * GET /api/workflows/conversation/:conversationId/active
 */
router.get("/conversation/:conversationId/active", async (req, res) => {
  try {
    const { conversationId } = req.params;
    console.log("[WorkflowRoutes] 📥 GET active workflow for conversation:", conversationId);

    const activeWorkflow = await workflowService.getActiveWorkflow(conversationId);
    
    if (!activeWorkflow) {
      console.log("[WorkflowRoutes] ❌ No active workflow found");
      return res.json({ workflow: null, interactions: [] });
    }

    console.log("[WorkflowRoutes] ✅ Active workflow found:", {
      id: activeWorkflow.id,
      solution: activeWorkflow.solution,
      status: activeWorkflow.status,
      currentStepIndex: activeWorkflow.currentStepIndex,
      hasWorkflowData: !!activeWorkflow.workflowData,
      workflowDataType: typeof activeWorkflow.workflowData,
      workflowDataKeys: activeWorkflow.workflowData ? Object.keys(activeWorkflow.workflowData) : [],
      stepListLength: activeWorkflow.workflowData?.stepList?.length,
    });

    // Get all interactions for this workflow
    const interactions = await workflowService.getInteractions(activeWorkflow.id);
    console.log("[WorkflowRoutes] 📝 Found interactions:", interactions.length);

    res.json({
      workflow: activeWorkflow,
      interactions: interactions,
    });
  } catch (error) {
    console.error("[WorkflowRoutes] ❌ Error fetching active workflow:", error);
    res.status(500).json({ 
      error: "Failed to fetch workflow",
      message: error instanceof Error ? error.message : "Unknown error"
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

    const workflows = await workflowService.getUserWorkflowHistory(
      userId,
      organizationId,
      limit
    );

    res.json({ workflows });
  } catch (error) {
    console.error("[WorkflowRoutes] Error fetching workflow history:", error);
    res.status(500).json({ 
      error: "Failed to fetch workflow history",
      message: error instanceof Error ? error.message : "Unknown error"
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
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;
