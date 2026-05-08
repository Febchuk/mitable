/**
 * Local Agent IPC Handlers
 *
 * Routes for the on-device Agent RLM: chat CRUD + the query loop.
 * All data lives in local SQLite; inference uses BYOK provider via keyVault.
 */

import { ipcMain, BrowserWindow } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import { randomUUID } from "crypto";
import { consoleLogger } from "../loggers";

export function registerLocalAgentHandlers() {
  // ── RLM Query ──────────────────────────────────────────────────────────

  ipcMain.handle(
    IPC_CHANNELS.LOCAL_AGENT_ASK,
    async (_, data: { message: string; conversationId?: string; timezone?: string }) => {
      try {
        const { localDb } = await import("../../services/on-device");
        if (!localDb.isAvailable()) await localDb.tryOpen();

        const activeId = localDb.getUserPreference("system", "activeLocalUserId");
        if (!activeId) return { error: "No active user" };

        const account = localDb.getLocalAccountById(activeId);
        const userName = account?.firstName || "there";

        // Load conversation history if continuing a chat
        let conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
        if (data.conversationId) {
          const msgs = localDb.getAgentMessages(data.conversationId);
          conversationHistory = msgs
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
        }

        const { runAgentLocalRlm } = await import("../../services/on-device/agent-rlm");

        const broadcastProgress = (event: { phase: string; tool?: string; iteration: number }) => {
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send(IPC_CHANNELS.LOCAL_AGENT_PROGRESS, event);
            }
          });
        };

        const result = await runAgentLocalRlm(
          activeId,
          userName,
          data.message,
          conversationHistory,
          data.timezone,
          broadcastProgress
        );

        // Auto-title the conversation from the first user message
        if (data.conversationId) {
          const convo = localDb.getAgentConversation(data.conversationId, activeId);
          if (convo?.title === "New chat") {
            const title =
              data.message.length > 60 ? data.message.slice(0, 57) + "..." : data.message;
            localDb.updateAgentConversationTitle(data.conversationId, activeId, title);
          }
          localDb.touchAgentConversation(data.conversationId);
        }

        return { response: result.response };
      } catch (err) {
        consoleLogger.error("[LocalAgent] Ask failed:", String(err));
        return { error: String(err) };
      }
    }
  );

  // ── Chat CRUD ──────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.LOCAL_AGENT_LIST_CHATS, async () => {
    try {
      const { localDb } = await import("../../services/on-device");
      if (!localDb.isAvailable()) await localDb.tryOpen();

      const activeId = localDb.getUserPreference("system", "activeLocalUserId");
      if (!activeId) return { conversations: [] };

      return { conversations: localDb.listAgentConversations(activeId) };
    } catch (err) {
      consoleLogger.error("[LocalAgent] List chats failed:", String(err));
      return { conversations: [] };
    }
  });

  ipcMain.handle(IPC_CHANNELS.LOCAL_AGENT_GET_CHAT, async (_, chatId: string) => {
    try {
      const { localDb } = await import("../../services/on-device");
      if (!localDb.isAvailable()) await localDb.tryOpen();

      const activeId = localDb.getUserPreference("system", "activeLocalUserId");
      if (!activeId) return null;

      const conversation = localDb.getAgentConversation(chatId, activeId);
      if (!conversation) return null;

      const messages = localDb.getAgentMessages(chatId);
      return { conversation, messages };
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.LOCAL_AGENT_CREATE_CHAT,
    async (_, data?: { id?: string; title?: string }) => {
      try {
        const { localDb } = await import("../../services/on-device");
        if (!localDb.isAvailable()) await localDb.tryOpen();

        const activeId = localDb.getUserPreference("system", "activeLocalUserId");
        if (!activeId) return { error: "No active user" };

        const id = data?.id || randomUUID();
        const title = data?.title || "New chat";
        const conversation = localDb.createAgentConversation(id, activeId, title);
        return { conversation };
      } catch (err) {
        return { error: String(err) };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.LOCAL_AGENT_RENAME_CHAT, async (_, chatId: string, title: string) => {
    try {
      const { localDb } = await import("../../services/on-device");
      if (!localDb.isAvailable()) return { error: "DB unavailable" };

      const activeId = localDb.getUserPreference("system", "activeLocalUserId");
      if (!activeId) return { error: "No active user" };

      localDb.updateAgentConversationTitle(chatId, activeId, title);
      return { success: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.LOCAL_AGENT_DELETE_CHAT, async (_, chatId: string) => {
    try {
      const { localDb } = await import("../../services/on-device");
      if (!localDb.isAvailable()) return { error: "DB unavailable" };

      const activeId = localDb.getUserPreference("system", "activeLocalUserId");
      if (!activeId) return { error: "No active user" };

      const deleted = localDb.deleteAgentConversation(chatId, activeId);
      return { success: deleted };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.LOCAL_AGENT_ADD_MESSAGE,
    async (
      _,
      data: { conversationId: string; role: string; content: string; toolCalls?: unknown[] }
    ) => {
      try {
        const { localDb } = await import("../../services/on-device");
        if (!localDb.isAvailable()) return { error: "DB unavailable" };

        const id = randomUUID();
        const message = localDb.addAgentMessage(
          id,
          data.conversationId,
          data.role,
          data.content,
          data.toolCalls || []
        );
        return { message };
      } catch (err) {
        return { error: String(err) };
      }
    }
  );
}
