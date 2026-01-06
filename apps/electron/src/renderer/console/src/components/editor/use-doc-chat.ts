"use client";

/**
 * useDocChat
 *
 * Custom hook for AI chat in document editing.
 * Connects Plate editor AI features to our backend API.
 */

import * as React from "react";

import { useChat as useBaseChat } from "@ai-sdk/react";
import { createLogger } from "../../../../lib/logger";

const logger = createLogger("useDocChat");
import { AIChatPlugin } from "@platejs/ai/react";
import { DefaultChatTransport } from "ai";
import { useEditorRef, usePluginOption } from "platejs/react";

import { aiChatPlugin } from "@/components/editor/plugins/ai-kit";

// API base URL from environment
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

/**
 * Hook to connect Plate editor AI features to our backend
 *
 * @param documentId - Optional document ID for context
 */
export const useDocChat = (documentId?: string) => {
  const editor = useEditorRef();
  const options = usePluginOption(aiChatPlugin, "chatOptions");

  const baseChat = useBaseChat({
    id: documentId ? `doc-${documentId}` : "editor",
    transport: new DefaultChatTransport({
      api: `${API_BASE_URL}/api/documents/ai-command`,
      fetch: async (input, init) => {
        const bodyOptions = editor.getOptions(aiChatPlugin).chatOptions?.body || {};

        const initBody = JSON.parse(init?.body as string);

        // Add document context to the request
        const body = {
          ...initBody,
          ...bodyOptions,
          documentId,
        };

        try {
          const res = await fetch(input, {
            ...init,
            body: JSON.stringify(body),
            headers: {
              ...init?.headers,
              "Content-Type": "application/json",
            },
          });

          if (!res.ok) {
            // If backend not available, use a helpful error response
            logger.warn("AI command API not available, using fallback");
            return createFallbackResponse();
          }

          return res;
        } catch (error) {
          logger.error("AI command request failed:", error);
          return createFallbackResponse();
        }
      },
    }),
    onData(data) {
      if (data.type === "data-toolName") {
        editor.setOption(
          AIChatPlugin,
          "toolName",
          data.data as Parameters<typeof editor.setOption<typeof AIChatPlugin, "toolName">>[2]
        );
      }
    },
    ...options,
  });

  // Set up the chat on the editor
  React.useEffect(() => {
    // Use type assertion to avoid complex generic type issues
    editor.setOption(
      AIChatPlugin,
      "chat",
      baseChat as unknown as Parameters<typeof editor.setOption>[2]
    );
  }, [baseChat.status, baseChat.messages, baseChat.error]);

  return baseChat;
};

/**
 * Create a fallback response when backend is not available
 * This provides a helpful message to the user
 */
function createFallbackResponse(): Response {
  const encoder = new TextEncoder();

  const messageId = `msg_fallback_${Date.now()}`;
  const fallbackText =
    "AI assistance is currently unavailable. The backend API endpoint `/api/documents/ai-command` needs to be implemented to enable AI features.\n\nIn the meantime, you can:\n- Continue editing manually\n- Use markdown shortcuts (e.g., ## for headings, - for lists)\n- Press / for slash commands";

  // Create a simple streaming response
  const stream = new ReadableStream({
    async start(controller) {
      // Start events
      controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));
      await delay(10);

      controller.enqueue(encoder.encode('data: {"type":"start-step"}\n\n'));
      await delay(10);

      controller.enqueue(encoder.encode(`data: {"type":"text-start","id":"${messageId}"}\n\n`));
      await delay(10);

      // Stream the fallback text in chunks
      const words = fallbackText.split(" ");
      for (const word of words) {
        const escapedText = (word + " ")
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\n/g, "\\n");

        controller.enqueue(
          encoder.encode(
            `data: {"type":"text-delta","id":"${messageId}","delta":"${escapedText}"}\n\n`
          )
        );
        await delay(20);
      }

      // End events
      controller.enqueue(encoder.encode(`data: {"type":"text-end","id":"${messageId}"}\n\n`));
      await delay(10);

      controller.enqueue(encoder.encode('data: {"type":"finish-step"}\n\n'));
      await delay(10);

      controller.enqueue(encoder.encode('data: {"type":"finish"}\n\n'));
      await delay(10);

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain",
      Connection: "keep-alive",
    },
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default useDocChat;
