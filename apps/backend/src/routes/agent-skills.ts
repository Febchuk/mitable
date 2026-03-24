/**
 * Agent Skills Routes
 *
 * API endpoints for agent skill execution (Layer 2).
 * Each route wraps an agentSkillsService method, handles auth,
 * and returns structured JSON for the MCP tool layer.
 *
 * Document generation (.docx) is handled on-device in Electron.
 * These routes only cover Google API operations that require OAuth.
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { agentSkillsService } from "../services/agent-skills.service.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ module: "AgentSkillRoutes" });
const router = Router();

router.use(requireAuth);

// ─── Google Auth Check ──────────────────────────────────────────────────

router.get("/google-auth-status", async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await agentSkillsService.checkGoogleAuth(req.userId!);
    res.json(result);
  } catch (error) {
    logger.error({ error: String(error) }, "Error checking Google auth");
    res.status(500).json({ error: "Failed to check Google auth status" });
  }
});

// ─── Send Email ─────────────────────────────────────────────────────────

router.post("/send-email", async (req: Request, res: Response): Promise<void> => {
  try {
    const { to, subject, body, attachment: attachmentPayload } = req.body;

    if (!to || !subject || !body) {
      res.status(400).json({ error: "Missing required fields: to, subject, body" });
      return;
    }

    let attachment: { fileName: string; mimeType: string; content: Buffer } | undefined;
    if (attachmentPayload?.contentBase64) {
      attachment = {
        fileName: attachmentPayload.fileName,
        mimeType: attachmentPayload.mimeType,
        content: Buffer.from(attachmentPayload.contentBase64, "base64"),
      };
    }

    const result = await agentSkillsService.sendEmail(req.userId!, {
      to,
      subject,
      body,
      attachment,
    });
    res.json(result);
  } catch (error) {
    logger.error({ error: String(error) }, "Error sending email");
    res.status(500).json({ success: false, error: "Failed to send email" });
  }
});

// ─── Create Drive Folder ────────────────────────────────────────────────

router.post("/create-drive-folder", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, parentFolderId } = req.body;

    if (!name) {
      res.status(400).json({ error: "Missing required field: name" });
      return;
    }

    const result = await agentSkillsService.createDriveFolder(req.userId!, {
      name,
      parentFolderId,
    });
    res.json(result);
  } catch (error) {
    logger.error({ error: String(error) }, "Error creating Drive folder");
    res.status(500).json({ success: false, error: "Failed to create Drive folder" });
  }
});

// ─── List Drive Folders ─────────────────────────────────────────────────

router.get("/list-drive-folders", async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await agentSkillsService.listDriveFolders(req.userId!);
    res.json(result);
  } catch (error) {
    logger.error({ error: String(error) }, "Error listing Drive folders");
    res.status(500).json({ success: false, error: "Failed to list Drive folders" });
  }
});

// ─── Upload to Drive ────────────────────────────────────────────────────

router.post("/upload-to-drive", async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileName, mimeType, contentBase64, folderId } = req.body;

    if (!fileName || !contentBase64) {
      res.status(400).json({ error: "Missing required fields: fileName, contentBase64" });
      return;
    }

    const content = Buffer.from(contentBase64, "base64");
    const result = await agentSkillsService.uploadToDrive(req.userId!, {
      fileName,
      mimeType: mimeType || "application/octet-stream",
      content,
      folderId,
    });
    res.json(result);
  } catch (error) {
    logger.error({ error: String(error) }, "Error uploading to Drive");
    res.status(500).json({ success: false, error: "Failed to upload to Drive" });
  }
});

// ─── Create Google Doc ──────────────────────────────────────────────────

router.post("/create-google-doc", async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, content, folderId } = req.body;

    if (!title || !content) {
      res.status(400).json({ error: "Missing required fields: title, content" });
      return;
    }

    const result = await agentSkillsService.createGoogleDoc(req.userId!, title, content, folderId);
    res.json(result);
  } catch (error) {
    logger.error({ error: String(error) }, "Error creating Google Doc");
    res.status(500).json({ success: false, error: "Failed to create Google Doc" });
  }
});

export default router;
