import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendStreamingMessage, type StreamCallbacks } from "../../../services/chatsService";
import { useUser } from "../../../context/UserContext";
import { authService } from "../../../services/authService";
import type { Message } from "../../../types";
import type { MultiWindowCaptureResult } from "@mitable/shared";

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
      multiWindowCapture: providedCapture,
    }: {
      chatId: string;
      content: string;
      metadata?: any;
      multiWindowCapture?: MultiWindowCaptureResult | null;
    }) => {
      const token = authService.getAccessToken();

      console.log("[useSendMessage] Starting mutation", {
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
        console.log("[useSendMessage] Multi-window screenshot capture requested");

        if (!window.consoleAPI) {
          console.error("[useSendMessage] window.consoleAPI is not available!");
        } else if (!window.consoleAPI.captureScreenshot) {
          console.error("[useSendMessage] window.consoleAPI.captureScreenshot is not available!");
        } else {
          try {
            console.log("[useSendMessage] Calling captureScreenshot...");
            multiWindowCapture = await window.consoleAPI.captureScreenshot();
            if (multiWindowCapture?.success) {
              console.log("[useSendMessage] Multi-window capture successful:", {
                screenshotCount: multiWindowCapture.screenshots.length,
                blockedCount: multiWindowCapture.blockedWindows.length,
              });
            } else {
              console.log("[useSendMessage] Capture blocked or failed:", multiWindowCapture?.success === false ? multiWindowCapture.error : "Unknown");
            }
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

      // Start streaming with optional multi-window capture and metadata
      await sendStreamingMessage(
        chatId,
        content,
        callbacks,
        token,
        multiWindowCapture,
        metadata
      );
    },

    // Optimistic update for user message
    onMutate: async ({ chatId, content }) => {
      await queryClient.cancelQueries({ queryKey: ["conversations", user?.id] });
      const previousConversations = queryClient.getQueryData(["conversations", user?.id]);

      const userMessage: Message = {
        id: `temp-user-${Date.now()}`,
        role: "user",
        content,
        type: "text",
        timestamp: new Date(),
      };

      queryClient.setQueryData(["conversations", user?.id], (old: any) =>
        old?.map((chat: any) => {
          if (chat.id === chatId) {
            return {
              ...chat,
              messages: [...chat.messages, userMessage],
              lastMessage: userMessage.content,
              timestamp: userMessage.timestamp,
            };
          }
          return chat;
        })
      );

      return { previousConversations, tempUserMessage: userMessage };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(["conversations", user?.id], context.previousConversations);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] });
    },
  });
}
