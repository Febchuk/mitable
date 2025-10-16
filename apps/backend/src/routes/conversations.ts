import { Router, Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { requireAuth } from "../middleware/auth";

const router = Router();

/**
 * GET /api/conversations
 * Fetch all conversations for the user
 */
router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;

  try {
    // Get all conversations with their latest message
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
      .orderBy(sql`${schema.conversations.updatedAt} DESC`);

    // For each conversation, get the last message and all messages
    const conversations = await Promise.all(
      conversationsData.map(async (conv) => {
        const messagesData = await db
          .select({
            id: schema.messages.id,
            role: schema.messages.role,
            content: schema.messages.content,
            messageType: schema.messages.messageType,
            cardData: schema.messages.cardData,
            sources: schema.messages.sources,
            createdAt: schema.messages.createdAt,
          })
          .from(schema.messages)
          .where(eq(schema.messages.conversationId, conv.id))
          .orderBy(schema.messages.createdAt);

        const messages = messagesData.map((msg) => ({
          id: msg.id,
          role: msg.role as "user" | "assistant",
          content: msg.content,
          timestamp: msg.createdAt,
          messageType: msg.messageType || undefined,
          cardData: msg.cardData || undefined,
          sources: (msg.sources as any[]) || undefined,
        }));

        const lastMessage = messages[messages.length - 1];

        return {
          id: conv.id,
          title: conv.title || "Untitled Conversation",
          lastMessage: lastMessage?.content || "",
          timestamp: conv.updatedAt,
          unread: false, // TODO: Implement unread status tracking if needed
          messages,
        };
      })
    );

    res.json({ conversations });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to fetch conversations",
    });
  }
});

/**
 * GET /api/conversations/:conversationId/messages
 * Fetch messages for a specific conversation
 */
router.get("/:conversationId/messages", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
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
        createdAt: schema.messages.createdAt,
      })
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(schema.messages.createdAt);

    const messages = messagesData.map((msg) => ({
      id: msg.id,
      role: msg.role as "user" | "assistant",
      content: msg.content,
      timestamp: msg.createdAt,
      messageType: msg.messageType || undefined,
      cardData: msg.cardData || undefined,
      sources: (msg.sources as any[]) || undefined,
    }));

    res.json({ messages });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to fetch messages",
    });
  }
});

/**
 * POST /api/conversations
 * Create a new conversation
 */
router.post("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
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
 * POST /api/conversations/:conversationId/messages
 * Send a message in a conversation
 */
router.post("/:conversationId/messages", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
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
});

export default router;
