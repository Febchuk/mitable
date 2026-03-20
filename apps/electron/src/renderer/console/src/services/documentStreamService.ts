/**
 * Document Stream Service
 *
 * SSE streaming for real-time document generation progress.
 */

import { getAuthToken } from "./api";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export interface StreamChunk {
  type: "chunk" | "complete" | "error" | "progress";
  content?: string;
  documentId?: string;
  sources?: any[];
  error?: string;
  phase?: "searching_sessions" | "analyzing_data" | "drafting" | "polishing";
  message?: string;
}

export interface StreamCallbacks {
  onChunk?: (content: string) => void;
  onProgress?: (phase: string, message: string) => void;
  onComplete?: (content: string, documentId: string, sources?: any[]) => void;
  onError?: (error: string) => void;
}

export async function generateDocumentStream(
  prompt: string,
  docType: string,
  callbacks: StreamCallbacks,
  options?: { sessionIds?: string[]; artifactIds?: string[]; tags?: string[] }
): Promise<void> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${API_BASE_URL}/api/documents/generate/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      prompt,
      docType,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(options?.sessionIds &&
        options.sessionIds.length > 0 && { sessionIds: options.sessionIds }),
      ...(options?.artifactIds &&
        options.artifactIds.length > 0 && { artifactIds: options.artifactIds }),
      ...(options?.tags && options.tags.length > 0 && { tags: options.tags }),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Failed to start generation" }));
    throw new Error(error.message || "Failed to start generation");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim() || line.startsWith(":")) continue;
        if (line === "data: [DONE]") {
          return;
        }

        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          try {
            const chunk: StreamChunk = JSON.parse(data);

            switch (chunk.type) {
              case "chunk":
                if (chunk.content) {
                  callbacks.onChunk?.(chunk.content);
                }
                break;

              case "progress":
                if (chunk.phase && chunk.message) {
                  callbacks.onProgress?.(chunk.phase, chunk.message);
                }
                break;

              case "complete":
                if (chunk.content && chunk.documentId) {
                  callbacks.onComplete?.(chunk.content, chunk.documentId, chunk.sources);
                }
                break;

              case "error":
                if (chunk.error) {
                  callbacks.onError?.(chunk.error);
                }
                break;
            }
          } catch (e) {
            console.error("Failed to parse SSE data:", e, data);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
