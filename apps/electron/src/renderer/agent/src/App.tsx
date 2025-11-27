import { useState } from "react";
import AgentPill from "./components/AgentPill";
import { createConversation } from "../../lib/api/conversations";
// Types are defined in ./global.d.ts

function App() {
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Create conversation on first message if needed
  const ensureConversation = async (): Promise<string> => {
    if (conversationId) {
      return conversationId;
    }

    try {
      const conversation = await createConversation("Agent Conversation");
      setConversationId(conversation.id);
      return conversation.id;
    } catch (error) {
      console.error("Failed to create conversation:", error);
      throw error;
    }
  };

  const handleSubmit = async (message: string) => {
    console.log("========================================");
    console.log("[Agent] SUBMIT STARTED - Message:", message);
    console.log("========================================");

    // Ensure we have a conversation ID
    let convId: string;
    try {
      console.log("[Agent] Ensuring conversation exists...");
      convId = await ensureConversation();
      console.log("[Agent] ✅ Conversation ID:", convId);
    } catch (error) {
      console.error("[Agent] ❌ Failed to create conversation:", error);
      return;
    }

    // Show conversation window
    console.log("[Agent] Showing conversation window...");
    window.agentAPI.showConversation();

    // Forward message to conversation window
    // The conversation window will handle conditional screenshot capture based on heuristics
    // Forward message to conversation window with all necessary data
    console.log("[Agent] Forwarding message to conversation window:", {
      message,
      conversationId: convId,
      userMessage: message,
    });

    window.agentAPI.sendMessageToConversation(
      {
        message,
        conversationId: convId,
        userMessage: message, // For display in conversation window
      },
      null // No screenshot - let conversation window handle conditional capture
    );

    console.log("[Agent] ✅ Message forwarded successfully");
    console.log("========================================");
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <AgentPill onSubmit={handleSubmit} />
    </div>
  );
}

export default App;
