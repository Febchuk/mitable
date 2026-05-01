import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import { ctx } from "../context";
import { createLogger } from "../../lib/logger";
import { agentSdkService } from "../../services/agentSdkService";
import { skillsStore } from "../../services/skillsStore";

export function registerAgentHandlers() {
  const agentLogger = createLogger("Agent");

  ipcMain.handle(
    IPC_CHANNELS.AGENT_SEND_MESSAGE,
    async (_event, conversationId: string, message: string) => {
      if (typeof conversationId !== "string" || !conversationId) {
        agentLogger.warn("AGENT_SEND_MESSAGE rejected: invalid conversationId");
        return { success: false, error: "Invalid conversationId" };
      }
      if (typeof message !== "string" || message.length === 0 || message.length > 50_000) {
        agentLogger.warn(
          "AGENT_SEND_MESSAGE rejected: message must be a non-empty string with max 50000 chars"
        );
        return { success: false, error: "Invalid message" };
      }

      agentLogger.info("Agent message received", { conversationId });
      await agentSdkService.sendMessage(conversationId, message, {
        onEvent: (event) => {
          if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
            ctx.consoleWindow.webContents.send(IPC_CHANNELS.AGENT_MESSAGE_EVENT, event);
          }
        },
      });
    }
  );

  ipcMain.handle(IPC_CHANNELS.AGENT_CANCEL, async () => {
    agentLogger.info("Agent cancel requested");
    agentSdkService.cancel();
  });

  ipcMain.handle(
    IPC_CHANNELS.AGENT_APPROVE_PLAN,
    async (_event, conversationId: string, approved: boolean) => {
      agentLogger.info("Agent plan response", { conversationId, approved });
      if (approved) {
        await agentSdkService.approvePlan(conversationId, {
          onEvent: (event) => {
            if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
              ctx.consoleWindow.webContents.send(IPC_CHANNELS.AGENT_MESSAGE_EVENT, event);
            }
          },
        });
      } else {
        agentSdkService.denyPlan(conversationId);
      }
    }
  );

  skillsStore.decayStaleSkills().catch((e) => {
    agentLogger.error("Failed to decay stale skills", e);
  });
}
