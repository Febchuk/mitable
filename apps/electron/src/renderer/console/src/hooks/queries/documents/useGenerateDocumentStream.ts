/**
 * useGenerateDocumentStream Hook
 *
 * React hook for streaming document generation with real-time progress.
 */

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { generateDocumentStream } from "../../../services/documentStreamService";
import { documentsKeys } from "./index";

export interface GenerationProgress {
  phase:
    | "indexing_sessions"
    | "searching_sessions"
    | "analyzing_data"
    | "drafting"
    | "polishing"
    | "complete";
  message: string;
}

export interface GenerationState {
  isGenerating: boolean;
  content: string;
  documentId: string | null;
  progress: GenerationProgress | null;
  error: string | null;
}

export function useGenerateDocumentStream() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<GenerationState>({
    isGenerating: false,
    content: "",
    documentId: null,
    progress: null,
    error: null,
  });

  const generate = useCallback(
    async (
      prompt: string,
      docType: string,
      options?: { sessionIds?: string[]; artifactIds?: string[] }
    ) => {
      setState({
        isGenerating: true,
        content: "",
        documentId: null,
        progress: { phase: "searching_sessions", message: "Starting..." },
        error: null,
      });

      try {
        await generateDocumentStream(
          prompt,
          docType,
          {
            onProgress: (phase, message) => {
              setState((prev) => ({
                ...prev,
                progress: { phase: phase as any, message },
              }));
            },

            onChunk: (chunk) => {
              setState((prev) => ({
                ...prev,
                content: prev.content + chunk,
              }));
            },

            onComplete: (content, documentId) => {
              setState((prev) => ({
                ...prev,
                isGenerating: false,
                content,
                documentId,
                progress: { phase: "complete", message: "Document ready!" },
              }));

              // Invalidate documents list
              queryClient.invalidateQueries({ queryKey: documentsKeys.lists() });
            },

            onError: (error) => {
              setState((prev) => ({
                ...prev,
                isGenerating: false,
                error,
              }));
            },
          },
          options
        );
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isGenerating: false,
          error: error instanceof Error ? error.message : "Generation failed",
        }));
      }
    },
    [queryClient]
  );

  const reset = useCallback(() => {
    setState({
      isGenerating: false,
      content: "",
      documentId: null,
      progress: null,
      error: null,
    });
  }, []);

  return {
    generate,
    reset,
    ...state,
  };
}
