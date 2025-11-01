import { db } from "../src/db/client";
import {
  users,
  conversations,
  messages,
  workflowSessions,
  workflowInteractions,
} from "../src/db/schema/index";
import { eq, and } from "drizzle-orm";

/**
 * Clear all chats for a specific user
 * Run with: npx tsx scripts/clear-user-chats.ts
 */

const USER_EMAIL = "jordan@lorikeet.ai";

async function clearUserChats() {
  console.log(`🔄 Clearing all chats for user: ${USER_EMAIL}\n`);

  try {
    // Step 1: Find the user
    const [user] = await db.select().from(users).where(eq(users.email, USER_EMAIL)).limit(1);

    if (!user) {
      console.log(`❌ User not found: ${USER_EMAIL}`);
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.firstName} ${user.lastName} (${user.id})\n`);

    // Step 2: Get conversation count
    const userConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, user.id));

    const conversationIds = userConversations.map((c) => c.id);

    console.log(`📊 Found ${userConversations.length} conversations`);

    if (conversationIds.length === 0) {
      console.log("✅ No conversations to delete. Done!\n");
      process.exit(0);
    }

    // Step 3: Delete workflow interactions first (foreign key constraint)
    let workflowInteractionCount = 0;
    for (const convId of conversationIds) {
      const workflowSess = await db
        .select()
        .from(workflowSessions)
        .where(eq(workflowSessions.conversationId, convId));

      for (const session of workflowSess) {
        const deleted = await db
          .delete(workflowInteractions)
          .where(eq(workflowInteractions.workflowSessionId, session.id))
          .returning();
        workflowInteractionCount += deleted.length;
      }
    }

    console.log(`   - Deleted ${workflowInteractionCount} workflow interactions`);

    // Step 4: Delete workflow sessions
    let workflowSessionCount = 0;
    for (const convId of conversationIds) {
      const deleted = await db
        .delete(workflowSessions)
        .where(eq(workflowSessions.conversationId, convId))
        .returning();
      workflowSessionCount += deleted.length;
    }

    console.log(`   - Deleted ${workflowSessionCount} workflow sessions`);

    // Step 5: Delete messages
    let messageCount = 0;
    for (const convId of conversationIds) {
      const deleted = await db
        .delete(messages)
        .where(eq(messages.conversationId, convId))
        .returning();
      messageCount += deleted.length;
    }

    console.log(`   - Deleted ${messageCount} messages`);

    // Step 6: Delete conversations
    const deletedConversations = await db
      .delete(conversations)
      .where(eq(conversations.userId, user.id))
      .returning();

    console.log(`   - Deleted ${deletedConversations.length} conversations\n`);

    console.log("✅ All chats cleared successfully!\n");
    console.log("📝 Summary:");
    console.log(`   User: ${user.firstName} ${user.lastName} (${user.email})`);
    console.log(`   Conversations: ${deletedConversations.length}`);
    console.log(`   Messages: ${messageCount}`);
    console.log(`   Workflow Sessions: ${workflowSessionCount}`);
    console.log(`   Workflow Interactions: ${workflowInteractionCount}\n`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Failed to clear chats:", error);
    process.exit(1);
  }
}

// Run the script
clearUserChats();
