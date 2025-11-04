import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendStreamingMessage, type StreamCallbacks } from "../../../services/chatsService";
import { useUser } from "../../../context/UserContext";
import { authService } from "../../../services/authService";
import type { Message } from "../../../types";

export interface SendMessageOptions {
  onChunk?: (content: string) => void;
  onComplete?: (fullContent: string) => void;
  onError?: (error: string) => void;
  onWindowTrigger?: (window: string, data: any) => void;
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
      screenshot: providedScreenshot,
      screenshotMetadata,
    }: {
      chatId: string;
      content: string;
      metadata?: any;
      screenshot?: string | null;
      screenshotMetadata?: any;
    }) => {
      const token = authService.getAccessToken();

      console.log("[useSendMessage] Starting mutation", {
        chatId,
        contentLength: content.length,
        hasMetadata: !!metadata,
        hasProvidedScreenshot: !!providedScreenshot,
        hasScreenshotMetadata: !!screenshotMetadata,
        captureScreenshotOption: options?.captureScreenshot,
        hasWindow: typeof window !== "undefined",
        hasConsoleAPI: typeof window !== "undefined" && !!window.consoleAPI,
        hasCaptureMethod: typeof window !== "undefined" && !!window.consoleAPI?.captureScreenshot,
      });

      if (!token) {
        throw new Error("No authentication token");
      }

      // Use provided screenshot or capture if requested (for workflow mode)
      let screenshot: string | undefined = providedScreenshot || undefined;

      // Only auto-capture if no screenshot provided and option is set
      if (!screenshot && options?.captureScreenshot) {
        console.log("[useSendMessage] Screenshot capture requested");

        if (!window.consoleAPI) {
          console.error("[useSendMessage] window.consoleAPI is not available!");
        } else if (!window.consoleAPI.captureScreenshot) {
          console.error("[useSendMessage] window.consoleAPI.captureScreenshot is not available!");
        } else {
          try {
            console.log("[useSendMessage] Calling captureScreenshot...");
            screenshot = (await window.consoleAPI.captureScreenshot()) || undefined;
            console.log("[useSendMessage] Screenshot captured:", {
              hasScreenshot: !!screenshot,
              size: screenshot?.length || 0,
            });
          } catch (error) {
            console.error("[useSendMessage] Screenshot capture failed:", error);
            // Continue without screenshot
          }
        }
      }

      // Define streaming callbacks
      const callbacks: StreamCallbacks = {
        onChunk: (chunk: string) => {
          options?.onChunk?.(chunk);
        },
        onComplete: (fullContent: string) => {
          options?.onComplete?.(fullContent);
        },
        onError: (error: string) => {
          options?.onError?.(error);
        },
        onWindowTrigger: (window: string, data: any) => {
          options?.onWindowTrigger?.(window, data);
        },
      };

      // Start streaming with optional screenshot, metadata, and screenshotMetadata
      await sendStreamingMessage(chatId, content, callbacks, token, screenshot, metadata, screenshotMetadata);
    },

    // Optimistic update for user message
    onMutate: async ({ chatId, content }) => {
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
