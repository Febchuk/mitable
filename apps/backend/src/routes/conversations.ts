import { Router, Request, Response } from "express";
import { db } from "../db/client";
import { conversations, messages } from "../db/schema/conversations.schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router = Router();

/**
 * GET /api/conversations
 * Fetch all conversations for the authenticated user with their messages
 */
router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    // Fetch user's conversations
    const userConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));

    // Fetch messages for each conversation
    const conversationsWithMessages = await Promise.all(
      userConversations.map(async (conversation) => {
        const conversationMessages = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conversation.id))
          .orderBy(messages.createdAt);

        // Get last message for preview
        const lastMessage =
          conversationMessages.length > 0
            ? conversationMessages[conversationMessages.length - 1]
            : null;

        return {
          id: conversation.id,
          title: conversation.title || "New Conversation",
          lastMessage: lastMessage?.content || "",
          timestamp: conversation.updatedAt,
          unread: false, // TODO: Implement unread tracking
          messages: conversationMessages.map((msg) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.createdAt,
            messageType: msg.messageType,
            cardData: msg.cardData,
            sources: msg.sources,
          })),
        };
      })
    );

    res.json({ conversations: conversationsWithMessages });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch conversations",
    });
  }
});

/**
 * GET /api/conversations/:id/messages
 * Fetch all messages for a specific conversation
 */
router.get("/:id/messages", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Verify the conversation belongs to the user
    const userConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));

    if (userConversations.length === 0 || userConversations[0].userId !== userId) {
      res.status(404).json({
        error: "Not Found",
        message: "Conversation not found",
      });
      return;
    }

    // Fetch messages
    const conversationMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt);

    res.json({
      messages: conversationMessages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.createdAt,
        messageType: msg.messageType,
        cardData: msg.cardData,
        sources: msg.sources,
      })),
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch messages",
    });
  }
});

/**
 * POST /api/conversations
 * Create a new conversation
 */
router.post("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { title, contextType, initialMessage } = req.body;

    // Create conversation
    const newConversations = await db
      .insert(conversations)
      .values({
        userId,
        title: title || "New Conversation",
        contextType: contextType || "general",
      })
      .returning();

    const conversation = newConversations[0];

    // If initial message provided, add it
    if (initialMessage) {
      await db.insert(messages).values({
        conversationId: conversation.id,
        role: "user",
        content: initialMessage,
      });
    }

    res.status(201).json({
      success: true,
      conversation: {
        id: conversation.id,
        title: conversation.title,
        contextType: conversation.contextType,
        createdAt: conversation.createdAt,
      },
    });
  } catch (error) {
    console.error("Error creating conversation:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to create conversation",
    });
  }
});

/**
 * POST /api/conversations/:id/messages
 * Send a message in a conversation
 */
router.post("/:id/messages", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { role, content, messageType, cardData, sources } = req.body;

    if (!role || !content) {
      res.status(400).json({
        error: "Bad Request",
        message: "role and content are required",
      });
      return;
    }

    // Verify the conversation belongs to the user
    const userConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));

    if (userConversations.length === 0 || userConversations[0].userId !== userId) {
      res.status(404).json({
        error: "Not Found",
        message: "Conversation not found",
      });
      return;
    }

    // Insert message
    const newMessages = await db
      .insert(messages)
      .values({
        conversationId: id,
        role,
        content,
        messageType: messageType || "text",
        cardData: cardData || null,
        sources: sources || [],
      })
      .returning();

    // Update conversation timestamp
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, id));

    res.status(201).json({
      success: true,
      message: {
        id: newMessages[0].id,
        role: newMessages[0].role,
        content: newMessages[0].content,
        timestamp: newMessages[0].createdAt,
        messageType: newMessages[0].messageType,
        cardData: newMessages[0].cardData,
        sources: newMessages[0].sources,
      },
    });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to send message",
    });
  }
});

export default router;
