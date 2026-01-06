import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendStreamingMessage, type StreamCallbacks } from "../../../services/chatsService";
import { useUser } from "../../../context/UserContext";
import { authService } from "../../../services/authService";
import type { Message } from "../../../types";
import type { MultiWindowCaptureResult } from "@mitable/shared";
import { createLogger } from "../../../../../lib/logger";

const logger = createLogger("useSendMessage");

export interface SendMessageOptions {
  onChunk?: (
    content: string,
    workflowSessionId?: string | null,
    relatedStepIndex?: number | null
  ) => void;
  onComplete?: (
    fullContent: string,
    messageType?: string,
    cardData?: any,
    workflowSessionId?: string | null,
    relatedStepIndex?: number | null
  ) => void;
  onDone?: (
    messageId: string,
    workflowSessionId?: string | null,
    relatedStepIndex?: number | null
  ) => void;
  onError?: (error: string) => void;
  onProgress?: (phase: string, message: string) => void;
  captureScreenshot?: boolean; // Whether to capture screenshot before sending
}

export function useSendMessage(options?: SendMessageOptions) {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: async ({
      chatId,
      content,
      metadata,
      multiWindowCapture: providedCapture,
    }: {
      chatId: string;
      content: string;
      metadata?: any;
      multiWindowCapture?: MultiWindowCaptureResult | null;
      workflowSessionId?: string | null;
      relatedStepIndex?: number | null;
    }) => {
      const token = authService.getAccessToken();

      logger.info(" Starting mutation", {
        chatId,
        contentLength: content.length,
        hasMetadata: !!metadata,
        hasProvidedCapture: !!providedCapture,
        captureScreenshotOption: options?.captureScreenshot,
        hasWindow: typeof window !== "undefined",
        hasConsoleAPI: typeof window !== "undefined" && !!window.consoleAPI,
        hasCaptureMethod: typeof window !== "undefined" && !!window.consoleAPI?.captureScreenshot,
      });

      if (!token) {
        throw new Error("No authentication token");
      }

      // Use provided capture or capture if requested (for workflow mode)
      let multiWindowCapture: MultiWindowCaptureResult | null | undefined = providedCapture;

      // Only auto-capture if no capture provided and option is set
      if (!multiWindowCapture && options?.captureScreenshot) {
        logger.info(" Multi-window screenshot capture requested");

        if (!window.consoleAPI) {
          logger.error(" window.consoleAPI is not available!");
        } else if (!window.consoleAPI.captureScreenshot) {
          logger.error(" window.consoleAPI.captureScreenshot is not available!");
        } else {
          try {
            logger.info(" Calling captureScreenshot...");
            multiWindowCapture = await window.consoleAPI.captureScreenshot();
            if (multiWindowCapture?.success) {
              logger.info(" Multi-window capture successful:", {
                screenshotCount: multiWindowCapture.screenshots.length,
                blockedCount: multiWindowCapture.blockedWindows.length,
              });
            } else {
              logger.info(
                "Capture blocked or failed:",
                multiWindowCapture?.success === false ? multiWindowCapture.error : "Unknown"
              );
            }
          } catch (error) {
            logger.error(" Screenshot capture failed:", error);
            // Continue without screenshot
          }
        }
      }

      // Define streaming callbacks - forward all workflow metadata to consumer
      const callbacks: StreamCallbacks = {
        onChunk: (chunk, workflowSessionId, relatedStepIndex) => {
          options?.onChunk?.(chunk, workflowSessionId, relatedStepIndex);
        },
        onComplete: (fullContent, messageType, cardData, workflowSessionId, relatedStepIndex) => {
          options?.onComplete?.(
            fullContent,
            messageType,
            cardData,
            workflowSessionId,
            relatedStepIndex
          );
        },
        onDone: (messageId, workflowSessionId, relatedStepIndex) => {
          options?.onDone?.(messageId, workflowSessionId, relatedStepIndex);
        },
        onError: (error) => {
          options?.onError?.(error);
        },
        onProgress: (phase, message) => {
          options?.onProgress?.(phase, message);
        },
      };

      // Start streaming with optional multi-window capture and metadata
      await sendStreamingMessage(chatId, content, callbacks, token, multiWindowCapture, metadata);
    },

    // Optimistic update for user message
    onMutate: async ({ chatId, content, workflowSessionId, relatedStepIndex }) => {
      // Cancel any outgoing refetches for this conversation
      await queryClient.cancelQueries({ queryKey: ["conversation-messages", chatId] });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData(["conversation-messages", chatId]);

      const userMessage: Message = {
        id: `temp-user-${Date.now()}`,
        role: "user",
        content,
        type: "text",
        timestamp: new Date(),
        // Include workflow routing fields for proper accordion rendering
        workflowSessionId: workflowSessionId ?? undefined,
        relatedStepIndex: relatedStepIndex ?? undefined,
      };

      // Optimistically update the conversation messages
      queryClient.setQueryData(["conversation-messages", chatId], (old: Message[] | undefined) => {
        if (!old) return [userMessage];
        return [...old, userMessage];
      });

      return { previousMessages, tempUserMessage: userMessage };
    },

    onError: (_err, variables, context) => {
      // Rollback the optimistic update on error
      if (context?.previousMessages) {
        queryClient.setQueryData(
          ["conversation-messages", variables.chatId],
          context.previousMessages
        );
      }
    },

    onSettled: (_data, _error, variables) => {
      // Invalidate both the conversations list and the specific conversation messages
      queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["conversation-messages", variables.chatId] });
    },
  });
}
