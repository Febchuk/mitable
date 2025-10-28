import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { guideGenerationService } from "../services/guideGeneration.service.js";
import { geminiVisionService } from "../services/gemini-vision.service.js";
import { db } from "../db/client.js";
import { conversations, messages } from "../db/schema/index.js";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.post("/progress", requireAuth, async (req, res) => {
  try {
    const { conversationId, screenshot, currentStepIndex } = req.body;

    // Validate required parameters
    if (!conversationId || typeof conversationId !== "string") {
      return res.status(400).json({ error: "Invalid or missing conversationId" });
    }
    if (!screenshot || typeof screenshot !== "string") {
      return res.status(400).json({ error: "Invalid or missing screenshot" });
    }
    if (typeof currentStepIndex !== "number" || currentStepIndex < 0) {
      return res.status(400).json({ error: "Invalid currentStepIndex" });
    }

    const solutionObject = await guideGenerationService.retrieveSolutionObject(conversationId);
    if (!solutionObject) {
      return res.status(404).json({ error: "No active guide found" });
    }

    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      with: { messages: { orderBy: desc(messages.createdAt), limit: 20 } },
    });

    const nextStepIndex = currentStepIndex + 1;

    // Validate nextStepIndex is within bounds
    if (nextStepIndex >= solutionObject.stepList.length) {
      return res.status(400).json({
        error: "No more steps available",
        message: `Guide completed. Current step ${currentStepIndex} is the last step.`,
      });
    }

    const evaluation = await geminiVisionService.evaluateProgress(
      screenshot,
      solutionObject,
      conversation?.messages || [],
      nextStepIndex
    );

    // Build updated solution immutably (no mutation)
    let updatedSolution = solutionObject;
    if (evaluation.needsAdjustment && evaluation.adjustedStepList) {
      updatedSolution = {
        ...solutionObject,
        stepList: evaluation.adjustedStepList,
        adjustmentHistory: [
          ...(solutionObject.adjustmentHistory || []),
          {
            timestamp: new Date().toISOString(),
            reason: evaluation.adjustmentReason || "Plan adjusted",
            oldStepCount: solutionObject.stepList.length,
            newStepCount: evaluation.adjustedStepList.length,
          },
        ],
      };
    }

    // Fully immutable update - create new object instead of mutating
    updatedSolution = {
      ...updatedSolution,
      currentStepIndex: nextStepIndex,
      stepList: updatedSolution.stepList.map((s, idx) => ({
        ...s,
        status: idx < nextStepIndex ? "completed" : idx === nextStepIndex ? "current" : "pending",
      })),
    };

    // Safe array access - we already validated bounds above
    const nextStep = updatedSolution.stepList[nextStepIndex];
    const visualGuidance = await geminiVisionService.analyzeStepExecution(
      screenshot,
      updatedSolution,
      nextStep,
      conversation?.messages || []
    );

    await guideGenerationService.updateSolutionObject(
      conversationId,
      updatedSolution,
      `Step ${nextStepIndex + 1} of ${updatedSolution.stepList.length}: ${nextStep.description}`
    );

    res.json({
      adjustedSolution: updatedSolution,
      visualGuidance,
      adjustmentMade: evaluation.needsAdjustment,
      adjustmentReason: evaluation.adjustmentReason,
    });
  } catch (error) {
    console.error("[GuidesRoute] Progress error:", error);
    res.status(500).json({ error: "Failed to progress guide" });
  }
});

router.get("/:conversationId", requireAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Validate conversationId parameter
    if (!conversationId || typeof conversationId !== "string") {
      return res.status(400).json({ error: "Invalid or missing conversationId" });
    }

    const solutionObject = await guideGenerationService.retrieveSolutionObject(conversationId);

    if (!solutionObject) {
      return res.status(404).json({ error: "No active guide" });
    }

    res.json(solutionObject);
  } catch (error) {
    console.error("[GuidesRoute] Get guide error:", error);
    res.status(500).json({ error: "Failed to retrieve guide" });
  }
});

export default router;
