import { Router, Request, Response } from "express";
import { eq, sql, inArray } from "drizzle-orm";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { requireAuth } from "../middleware/auth";
import { OrchestratorService } from "../services/orchestrator.service";
import { workflowService } from "../services/workflow.service";
import { ScreenshotAnnotator } from "../utils/screenshot-annotator";
import { coordinateConverterService } from "../services/coordinate-converter.service";

// Initialize orchestrator (replaces old agentService)
const orchestrator = new OrchestratorService();

const router = Router();

/**
 * @openapi
 * /conversations:
 *   get:
 *     tags:
 *       - Conversations
 *     summary: Get paginated conversations
 *     description: Retrieve paginated conversations for the authenticated user, including all messages and last message preview
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number (starts at 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of conversations per page (max 100)
 *     responses:
 *       200:
 *         description: Conversations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conversations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       title:
 *                         type: string
 *                         example: How to set up my dev environment?
 *                       lastMessage:
 *                         type: string
 *                         description: Preview of the last message
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       unread:
 *                         type: boolean
 *                       messages:
 *                         type: array
 *                         items:
 *                           $ref: '#/components/schemas/Message'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 20
 *                     total:
 *                       type: integer
 *                       example: 49
 *                     totalPages:
 *                       type: integer
 *                       example: 3
 *                     hasNext:
 *                       type: boolean
 *                       example: true
 *                     hasPrev:
 *                       type: boolean
 *                       example: false
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
 */
router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;

  try {
    // Parse pagination parameters
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    // Parse includeMessages parameter (default: false for performance)
    const includeMessages = req.query.includeMessages === "true";

    // Get total count of conversations
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.conversations)
      .where(eq(schema.conversations.userId, userId));

    const totalPages = Math.ceil(count / limit);

    // Get paginated conversations
    const conversationsData = await db
      .select({
        id: schema.conversations.id,
        title: schema.conversations.title,
        contextType: schema.conversations.contextType,
        createdAt: schema.conversations.createdAt,
        updatedAt: schema.conversations.updatedAt,
      })
      .from(schema.conversations)
      .where(eq(schema.conversations.userId, userId))
      .orderBy(sql`${schema.conversations.updatedAt} DESC`)
      .limit(limit)
      .offset(offset);

    // If no conversations, return empty result
    if (conversationsData.length === 0) {
      res.json({
        conversations: [],
        pagination: {
          page,
          limit,
          total: count,
          totalPages,
          hasNext: false,
          hasPrev: false,
        },
      });
      return;
    }

    const messagesByConversation = new Map<string, any[]>();

    // Only fetch messages if requested (for performance)
    if (includeMessages) {
      // Get all messages for these conversations in a single query (optimized!)
      const conversationIds = conversationsData.map((conv) => conv.id);
      const allMessages = await db
        .select({
          id: schema.messages.id,
          conversationId: schema.messages.conversationId,
          role: schema.messages.role,
          content: schema.messages.content,
          messageType: schema.messages.messageType,
          cardData: schema.messages.cardData,
          sources: schema.messages.sources,
          createdAt: schema.messages.createdAt,
        })
        .from(schema.messages)
        .where(inArray(schema.messages.conversationId, conversationIds))
        .orderBy(schema.messages.createdAt);

      // Group messages by conversation ID
      for (const msg of allMessages) {
        if (!messagesByConversation.has(msg.conversationId)) {
          messagesByConversation.set(msg.conversationId, []);
        }
        messagesByConversation.get(msg.conversationId)!.push(msg);
      }
    }

    // Build conversation response
    const conversations = conversationsData.map((conv) => {
      const messagesData = messagesByConversation.get(conv.id) || [];
      const messages = includeMessages
        ? messagesData.map((msg) => ({
            id: msg.id,
            role: msg.role as "user" | "assistant",
            content: msg.content,
            timestamp: msg.createdAt,
            messageType: msg.messageType || undefined,
            cardData: msg.cardData || undefined,
            sources: (msg.sources as any[]) || undefined,
          }))
        : undefined;

      const lastMessage = messages ? messages[messages.length - 1] : undefined;

      const result: any = {
        id: conv.id,
        title: conv.title || "Untitled Conversation",
        lastMessage: lastMessage?.content || "",
        timestamp: conv.updatedAt,
        unread: false, // TODO: Implement unread status tracking if needed
      };

      // Only include messages array if requested
      if (includeMessages) {
        result.messages = messages;
      }

      return result;
    });

    res.json({
      conversations,
      pagination: {
        page,
        limit,
        total: count,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to fetch conversations",
    });
  }
});

/**
 * @openapi
 * /conversations/{conversationId}/messages:
 *   get:
 *     tags:
 *       - Conversations
 *     summary: Get conversation messages
 *     description: Retrieve all messages for a specific conversation. Verifies conversation ownership.
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the conversation
 *     responses:
 *       200:
 *         description: Messages retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
 */
router.get(
  "/:conversationId/messages",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id || req.userId;
    const { conversationId } = req.params;

    if (!userId) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User not authenticated",
      });
      return;
    }

    try {
      // Verify conversation belongs to user
      const [conversation] = await db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, conversationId))
        .limit(1);

      if (!conversation) {
        res.status(404).json({
          error: "Not Found",
          message: "Conversation not found",
        });
        return;
      }

      if (conversation.userId !== userId) {
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to access this conversation",
        });
        return;
      }

      // Get all messages for the conversation
      const messagesData = await db
        .select({
          id: schema.messages.id,
          role: schema.messages.role,
          content: schema.messages.content,
          messageType: schema.messages.messageType,
          cardData: schema.messages.cardData,
          sources: schema.messages.sources,
          workflowSessionId: schema.messages.workflowSessionId,
          relatedStepIndex: schema.messages.relatedStepIndex,
          createdAt: schema.messages.createdAt,
        })
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId))
        .orderBy(schema.messages.createdAt);

      const messages = messagesData.map((msg) => {
        // Extract windowTrigger from cardData if it exists
        const cardData = msg.cardData as any;
        const windowTrigger = cardData?.windowTrigger;

        // Create clean cardData without windowTrigger (since it's returned separately)
        const cleanCardData = cardData ? { ...cardData } : undefined;
        if (cleanCardData && windowTrigger) {
          delete cleanCardData.windowTrigger;
        }

        return {
          id: msg.id,
          role: msg.role as "user" | "assistant",
          content: msg.content,
          timestamp: msg.createdAt,
          messageType: msg.messageType || undefined,
          cardData: cleanCardData || undefined,
          sources: (msg.sources as any[]) || undefined,
          windowTrigger: windowTrigger || undefined,
          workflowSessionId: msg.workflowSessionId || undefined,
          relatedStepIndex: msg.relatedStepIndex ?? undefined,
        };
      });

      res.json({ messages });
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to fetch messages",
      });
    }
  }
);

/**
 * @openapi
 * /conversations:
 *   post:
 *     tags:
 *       - Conversations
 *     summary: Create a new conversation
 *     description: Start a new conversation with an optional initial message
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Conversation title
 *                 example: Setting up development environment
 *               contextType:
 *                 type: string
 *                 enum: [help_request, general, expert]
 *                 default: general
 *                 example: help_request
 *               initialMessage:
 *                 type: string
 *                 description: Optional first message to add to the conversation
 *                 example: I need help setting up my local development environment
 *     responses:
 *       200:
 *         description: Conversation created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 conversation:
 *                   $ref: '#/components/schemas/Conversation'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
 */
router.post("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id || req.userId;
  const { title, contextType, initialMessage } = req.body;

  if (!userId) {
    res.status(401).json({
      error: "Unauthorized",
      message: "User not authenticated",
    });
    return;
  }

  try {
    // Create conversation
    const [conversation] = await db
      .insert(schema.conversations)
      .values({
        userId,
        title: title || "New Conversation",
        contextType: contextType || "general",
      })
      .returning({
        id: schema.conversations.id,
        title: schema.conversations.title,
        contextType: schema.conversations.contextType,
        createdAt: schema.conversations.createdAt,
      });

    // If initial message provided, create it
    if (initialMessage) {
      await db.insert(schema.messages).values({
        conversationId: conversation.id,
        role: "user",
        content: initialMessage,
      });
    }

    res.json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error("Error creating conversation:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to create conversation",
    });
  }
});

/**
 * @openapi
 * /conversations/{conversationId}/messages:
 *   post:
 *     tags:
 *       - Conversations
 *     summary: Send a message in conversation
 *     description: Add a new message to an existing conversation. Supports user and assistant messages with optional metadata.
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the conversation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *               - content
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, assistant]
 *                 example: user
 *               content:
 *                 type: string
 *                 description: Message content
 *                 example: How do I install Node.js?
 *               messageType:
 *                 type: string
 *                 enum: [text, screenshot, visual_guidance]
 *                 default: text
 *               cardData:
 *                 type: object
 *                 description: Optional structured data for card displays
 *                 nullable: true
 *               sources:
 *                 type: array
 *                 description: Optional sources/references for the message
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                     url:
 *                       type: string
 *                     relevanceScore:
 *                       type: number
 *     responses:
 *       200:
 *         description: Message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   $ref: '#/components/schemas/Message'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
 */
router.post(
  "/:conversationId/messages",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id || req.userId;
    const { conversationId } = req.params;
    const { role, content, messageType, cardData, sources } = req.body;

    if (!userId) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User not authenticated",
      });
      return;
    }

    if (!role || !content) {
      res.status(400).json({
        error: "Bad Request",
        message: "role and content are required",
      });
      return;
    }

    if (role !== "user" && role !== "assistant") {
      res.status(400).json({
        error: "Bad Request",
        message: "role must be 'user' or 'assistant'",
      });
      return;
    }

    try {
      // Verify conversation belongs to user
      const [conversation] = await db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, conversationId))
        .limit(1);

      if (!conversation) {
        res.status(404).json({
          error: "Not Found",
          message: "Conversation not found",
        });
        return;
      }

      if (conversation.userId !== userId) {
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to access this conversation",
        });
        return;
      }

      // Create message
      const [message] = await db
        .insert(schema.messages)
        .values({
          conversationId,
          role,
          content,
          messageType: messageType || "text",
          cardData: cardData || null,
          sources: sources || [],
        })
        .returning({
          id: schema.messages.id,
          role: schema.messages.role,
          content: schema.messages.content,
          messageType: schema.messages.messageType,
          cardData: schema.messages.cardData,
          sources: schema.messages.sources,
          createdAt: schema.messages.createdAt,
        });

      // Update conversation's updatedAt timestamp
      await db
        .update(schema.conversations)
        .set({ updatedAt: new Date() })
        .where(eq(schema.conversations.id, conversationId));

      res.json({
        success: true,
        message: {
          id: message.id,
          role: message.role as "user" | "assistant",
          content: message.content,
          timestamp: message.createdAt,
          messageType: message.messageType || undefined,
          cardData: message.cardData || undefined,
          sources: (message.sources as any[]) || undefined,
        },
      });
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to send message",
      });
    }
  }
);

/**
 * @openapi
 * /conversations/{conversationId}/messages/stream:
 *   post:
 *     tags:
 *       - Conversations
 *     summary: Send a message and stream AI response
 *     description: Send a user message and receive a streaming AI response in real-time via Server-Sent Events (SSE)
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the conversation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: User message content
 *                 example: How do I submit a pull request?
 *               screenshot:
 *                 type: string
 *                 description: Base64 encoded screenshot (optional)
 *               screenshotMetadata:
 *                 type: object
 *                 description: Screenshot metadata (optional)
 *               metadata:
 *                 type: object
 *                 description: Metadata from WorkflowOptions UI interactions (optional)
 *                 properties:
 *                   workflowAction:
 *                     type: string
 *                     enum: [progress_step, custom_question, exit_workflow]
 *                     description: The action selected from WorkflowOptions component
 *                   selectedOption:
 *                     type: number
 *                     description: Which option number was selected (1, 2, or 3)
 *     responses:
 *       200:
 *         description: Streaming response (SSE)
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   enum: [chunk, complete, error]
 *                 content:
 *                   type: string
 *                 messageId:
 *                   type: string
 *                 error:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 *     security:
 *       - BearerAuth: []
 */
router.post(
  "/:conversationId/messages/stream",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id || req.userId;
    const { conversationId } = req.params;
    const { content, screenshot, screenshotMetadata, metadata } = req.body;

    console.log("[Conversations] Request received:", {
      conversationId,
      userId,
      contentLength: content?.length || 0,
      hasScreenshot: !!screenshot,
      screenshotLength: screenshot?.length || 0,
      screenshotMetadata,
      metadata,
    });

    if (!userId) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User not authenticated",
      });
      return;
    }

    if (!content) {
      res.status(400).json({
        error: "Bad Request",
        message: "content is required",
      });
      return;
    }

    try {
      // Fetch user and conversation in parallel (optimization)
      const [userResult, conversationResult] = await Promise.all([
        db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1),
        db
          .select()
          .from(schema.conversations)
          .where(eq(schema.conversations.id, conversationId))
          .limit(1),
      ]);

      const user = userResult[0];
      const conversation = conversationResult[0];

      // Validate user exists
      if (!user) {
        res.status(404).json({
          error: "Not Found",
          message: "User not found",
        });
        return;
      }

      // Validate conversation exists
      if (!conversation) {
        res.status(404).json({
          error: "Not Found",
          message: "Conversation not found",
        });
        return;
      }

      // Validate conversation belongs to user
      if (conversation.userId !== userId) {
        res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to access this conversation",
        });
        return;
      }

      // Check if there's an active workflow for this conversation
      const activeWorkflow = await workflowService.getActiveWorkflow(conversationId);
      const workflowSessionId = activeWorkflow?.id || metadata?.workflowSessionId || null;
      const currentStepIndex = activeWorkflow?.currentStepIndex || metadata?.currentStepIndex || null;

      // Save user message to database with workflow fields
      const [userMessage] = await db
        .insert(schema.messages)
        .values({
          conversationId,
          role: "user",
          content,
          messageType: "text",
          workflowSessionId, // Add workflow session ID if present
          relatedStepIndex: currentStepIndex, // Add step index if present
        })
        .returning({
          id: schema.messages.id,
          role: schema.messages.role,
          content: schema.messages.content,
          createdAt: schema.messages.createdAt,
        });

      console.log(`[Stream] User message saved: ${userMessage.id}`);

      // Dual-write to workflow_interactions if this is a workflow question
      if (workflowSessionId && metadata?.workflowAction === "custom_question") {
        await workflowService.addWorkflowInteraction(
          workflowSessionId,
          "user_question",
          "user",
          content,
          currentStepIndex,
          { screenshot, screenshotMetadata }
        );
        console.log(`[Stream] Workflow interaction saved for user question`);
      }

      // Get recent conversation history (last 20 messages for context)
      const historyData = await db
        .select({
          id: schema.messages.id,
          role: schema.messages.role,
          content: schema.messages.content,
          messageType: schema.messages.messageType,
          cardData: schema.messages.cardData,
          sources: schema.messages.sources,
          workflowSessionId: schema.messages.workflowSessionId,
          relatedStepIndex: schema.messages.relatedStepIndex,
          createdAt: schema.messages.createdAt,
        })
        .from(schema.messages)
        .where(eq(schema.messages.conversationId, conversationId))
        .orderBy(sql`${schema.messages.createdAt} DESC`)
        .limit(20);

      // Reverse to get chronological order (oldest first)
      const conversationHistory = historyData.reverse();

      // Reuse user data from earlier query (no need to fetch again!)
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

      console.log("[Conversations] User profile (from cache):", {
        organizationId: user.organizationId,
        name: fullName,
        email: user.email,
      });

      console.log("[Conversations] ToolContext created:", {
        conversationId,
        userId,
        historyLength: conversationHistory.length,
        hasUserProfile: !!user,
        userProfileOrg: user.organizationId,
      });

      // Set up Server-Sent Events (SSE)
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

      // Keep connection alive
      const keepAliveInterval = setInterval(() => {
        res.write(":ping\n\n");
      }, 15000);

      let assistantContent = "";
      let assistantMessageType = "text";
      let assistantCardData: any = null;
      let assistantSources: any[] = [];
      let assistantWindowTrigger: any = undefined;

      try {
        console.log("[Conversations] Starting OrchestratorService.processMessage");

        // Stream AI response using multi-agent orchestrator
        const stream = orchestrator.processMessage({
          conversationId,
          userId,
          organizationId: user.organizationId, // Required for multi-agent architecture
          screenshot: screenshot || undefined, // Pass screenshot if provided
          screenshotMetadata: screenshotMetadata || undefined, // Pass metadata (scaleFactor, dimensions)
          metadata: metadata || undefined, // Pass metadata from WorkflowOptions UI interactions
          userProfile: {
            name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
            email: user.email,
            organizationId: user.organizationId,
          },
          conversationHistory: conversationHistory.map((msg) => ({
            id: msg.id,
            conversationId,
            role: msg.role as "user" | "assistant",
            content: msg.content,
            messageType: msg.messageType || "text",
            cardData: msg.cardData || null,
            sources: (msg.sources as any) || [],
            workflowSessionId: msg.workflowSessionId || null,
            relatedStepIndex: msg.relatedStepIndex || null,
            createdAt: msg.createdAt,
          })),
        });

        for await (const chunk of stream) {
          // Log chunk details (only for non-text chunks to avoid spam)
          if (chunk.type !== "chunk") {
            console.log("[Conversations] Streaming chunk sent:", {
              type: chunk.type,
              hasContent: !!chunk.content,
              hasWindowTrigger: !!(chunk as any).windowTrigger,
              windowType: (chunk as any).windowTrigger?.window,
            });
          }

          // Inject workflow metadata into every chunk so frontend knows where to route it
          // If no active workflow, these will be null and message renders normally
          const enrichedChunk = {
            ...chunk,
            workflowSessionId: workflowSessionId,
            relatedStepIndex: currentStepIndex,
          };

          // Send enriched chunk to client
          res.write(`data: ${JSON.stringify(enrichedChunk)}\n\n`);

          // Emit separate window_trigger event if windowTrigger is embedded in complete chunk
          if (chunk.type === "complete" && (chunk as any).windowTrigger) {
            const windowTriggerEvent = {
              type: "window_trigger",
              windowTrigger: (chunk as any).windowTrigger,
            };

            console.log("[Conversations] Emitting window_trigger event:", {
              window: (chunk as any).windowTrigger.window,
              hasData: !!(chunk as any).windowTrigger.data,
            });

            res.write(`data: ${JSON.stringify(windowTriggerEvent)}\n\n`);
          }

          // Accumulate content and metadata for database save
          if (chunk.type === "chunk" && chunk.content) {
            assistantContent += chunk.content;
          } else if (chunk.type === "complete") {
            if (chunk.content) {
              assistantContent = chunk.content;
            }
            // Extract metadata from complete chunk
            if ((chunk as any).messageType) {
              assistantMessageType = (chunk as any).messageType;
            }
            if ((chunk as any).cardData) {
              assistantCardData = (chunk as any).cardData;
            }
            if ((chunk as any).sources) {
              assistantSources = (chunk as any).sources;
            }
          } else if (chunk.type === "window_trigger") {
            // Capture windowTrigger for database storage
            if ((chunk as any).windowTrigger) {
              assistantWindowTrigger = (chunk as any).windowTrigger;
            }
          }
        }

        // Save complete assistant message to database with metadata
        // If windowTrigger exists, merge it into cardData for persistence
        const finalCardData = assistantWindowTrigger
          ? { ...(assistantCardData || {}), windowTrigger: assistantWindowTrigger }
          : assistantCardData;

        // Extract workflow fields from cardData
        const assistantWorkflowSessionId = finalCardData?.workflowSessionId || workflowSessionId || null;
        const assistantStepIndex = finalCardData?.currentStepIndex ?? currentStepIndex ?? null;

        const [assistantMessage] = await db
          .insert(schema.messages)
          .values({
            conversationId,
            role: "assistant",
            content: assistantContent,
            messageType: assistantMessageType,
            cardData: finalCardData,
            sources: assistantSources,
            workflowSessionId: assistantWorkflowSessionId, // Add workflow session ID
            relatedStepIndex: assistantStepIndex, // Add step index
          })
          .returning({
            id: schema.messages.id,
          });

        console.log(`[Stream] Assistant message saved: ${assistantMessage.id}`);

        // Dual-write to workflow_interactions if this is a workflow response
        if (assistantWorkflowSessionId) {
          const interactionType = metadata?.workflowAction === "progress_step"
            ? "step_progress"
            : "ai_response";

          await workflowService.addWorkflowInteraction(
            assistantWorkflowSessionId,
            interactionType,
            "assistant",
            assistantContent,
            assistantStepIndex,
            { cardData: finalCardData, sources: assistantSources, workflowAction: metadata?.workflowAction }
          );
          console.log(`[Stream] Workflow interaction saved for assistant response (${interactionType})`);
        }

        // Debug: Save annotated screenshot if enabled and has visual guidance
        if (process.env.DEBUG_SAVE_SCREENSHOTS === 'true') {
          console.log('[DEBUG SCREENSHOT] Debug mode active, checking conditions:', {
            envVariableSet: process.env.DEBUG_SAVE_SCREENSHOTS === 'true',
            hasScreenshot: !!screenshot,
            hasMetadata: !!screenshotMetadata,
            hasVisualGuidance: !!finalCardData?.visualGuidance,
            hasElement: !!finalCardData?.visualGuidance?.element,
            hasBoundingBox: !!finalCardData?.visualGuidance?.element?.boundingBox,
            boundingBoxValue: finalCardData?.visualGuidance?.element?.boundingBox,
          });

          if (screenshot && screenshotMetadata) {
            try {
              // Check if the response has visual guidance data with bounding box
              const visualGuidance = finalCardData?.visualGuidance;
              if (visualGuidance?.element?.boundingBox) {
                console.log('[DEBUG SCREENSHOT] All conditions met, saving annotated screenshot');
                const annotator = new ScreenshotAnnotator();

                // Convert pixel coordinates back to normalized for annotation
                // (gemini-vision.service.ts already converted normalized → pixels for overlay rendering)
                const normalizedBoundingBox = coordinateConverterService.convertToNormalized(
                  visualGuidance.element.boundingBox,
                  {
                    width: screenshotMetadata.width,
                    height: screenshotMetadata.height,
                  }
                );

                console.log('[DEBUG SCREENSHOT] Coordinate conversion for annotation:', {
                  pixels: visualGuidance.element.boundingBox,
                  normalized: normalizedBoundingBox,
                });

                const result = await annotator.annotate(
                  screenshot,
                  normalizedBoundingBox,
                  {
                    width: screenshotMetadata.width,
                    height: screenshotMetadata.height,
                  },
                  {
                    label: visualGuidance.elementDescription || visualGuidance.element.label || 'Target Element',
                    confidence: visualGuidance.element.confidence || 0.5,
                    instruction: content,
                    elementType: visualGuidance.element.type,
                  }
                );
                console.log('[DEBUG SCREENSHOT] Screenshot saved successfully:', result);
              } else {
                console.warn('[DEBUG SCREENSHOT] Skipping annotation - no bounding box in visual guidance response');
              }
            } catch (debugError) {
              console.error('[DEBUG SCREENSHOT] Failed to save annotated screenshot:', debugError);
              // Don't fail the request, just log the error
            }
          } else {
            console.warn('[DEBUG SCREENSHOT] Skipping annotation - missing screenshot or metadata', {
              hasScreenshot: !!screenshot,
              hasMetadata: !!screenshotMetadata,
            });
          }
        }

        // Generate conversation title if this is the first exchange
        // conversationHistory includes the just-saved user message, so length <= 2 means first exchange
        if (conversationHistory.length <= 2) {
          console.log("[Stream] First exchange detected - generating conversation title");

          try {
            const { titleGenerationService } = await import("../services/titleGeneration.service");
            const generatedTitle = await titleGenerationService.generateTitle(
              content,
              assistantContent
            );

            console.log("[Stream] Generated title:", generatedTitle);

            // Update conversation with generated title and timestamp
            await db
              .update(schema.conversations)
              .set({
                title: generatedTitle,
                updatedAt: new Date(),
              })
              .where(eq(schema.conversations.id, conversationId));

            console.log("[Stream] Conversation title updated successfully");
          } catch (titleError) {
            console.error("[Stream] Error generating title:", titleError);
            // Continue even if title generation fails - just update timestamp
            await db
              .update(schema.conversations)
              .set({ updatedAt: new Date() })
              .where(eq(schema.conversations.id, conversationId));
          }
        } else {
          // Not first exchange - just update timestamp
          await db
            .update(schema.conversations)
            .set({ updatedAt: new Date() })
            .where(eq(schema.conversations.id, conversationId));
        }

        // Send final event with message ID and workflow fields
        res.write(
          `data: ${JSON.stringify({
            type: "done",
            messageId: assistantMessage.id,
            workflowSessionId: assistantWorkflowSessionId,
            relatedStepIndex: assistantStepIndex,
          })}\n\n`
        );

        console.log("[Conversations] Streaming completed successfully:", {
          messageId: assistantMessage.id,
          contentLength: assistantContent.length,
        });
      } catch (streamError) {
        console.error("[Stream] Error during streaming:", streamError);
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            error:
              streamError instanceof Error
                ? streamError.message
                : "An error occurred during streaming",
          })}\n\n`
        );
      } finally {
        clearInterval(keepAliveInterval);
        res.end();
      }
    } catch (error) {
      console.error("[Stream] Error:", error);
      // If headers haven't been sent yet, send JSON error
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : "Failed to process message",
        });
      }
    }
  }
);

/**
 * Pause an active workflow
 * POST /api/conversations/:conversationId/workflow/pause
 */
router.post(
  "/:conversationId/workflow/pause",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const { conversationId } = req.params;

    try {
      // Verify conversation belongs to user
      const conversation = await db.query.conversations.findFirst({
        where: eq(schema.conversations.id, conversationId),
      });

      if (!conversation) {
        res.status(404).json({ error: "Not Found", message: "Conversation not found" });
        return;
      }

      if (conversation.userId !== userId) {
        res.status(403).json({ error: "Forbidden", message: "Access denied" });
        return;
      }

      // Get active workflow for this conversation
      const activeWorkflow = await workflowService.getActiveWorkflow(conversationId);

      if (!activeWorkflow) {
        res.status(404).json({ error: "Not Found", message: "No active workflow found" });
        return;
      }

      // Pause the workflow
      const pausedWorkflow = await workflowService.pauseWorkflow(activeWorkflow.id);

      console.log("[Conversations] Workflow paused:", activeWorkflow.id);

      // Return the updated workflow state (SolutionObject + metadata)
      // Frontend will use this to update WorkflowAccordion's cardData
      res.json({
        success: true,
        workflowSessionId: pausedWorkflow.id,
        status: pausedWorkflow.status,
        workflowData: pausedWorkflow.workflowData, // Full SolutionObject with steps
        currentStepIndex: pausedWorkflow.currentStepIndex,
      });
    } catch (error) {
      console.error("[Conversations] Error pausing workflow:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to pause workflow",
      });
    }
  }
);

export default router;
