/**
 * Documents Query Hooks
 *
 * React Query hooks for knowledge base documentation functionality.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "../../../context/UserContext";
import * as documentsService from "../../../services/documentsService";
import type { ListDocumentsParams } from "../../../services/documentsService";
import type {
  CreateDocumentRequest,
  UpdateDocumentRequest,
  GenerateDocumentRequest,
  EnhanceDocumentRequest,
  ExportNotionRequest,
} from "@mitable/shared";

// Query Keys
export const documentsKeys = {
  all: ["documents"] as const,
  lists: () => [...documentsKeys.all, "list"] as const,
  list: (params?: ListDocumentsParams) => [...documentsKeys.lists(), params] as const,
  details: () => [...documentsKeys.all, "detail"] as const,
  detail: (id: string) => [...documentsKeys.details(), id] as const,
  versions: (id: string) => [...documentsKeys.detail(id), "versions"] as const,
};

// ===========================
// List Documents
// ===========================

export function useDocuments(params?: ListDocumentsParams) {
  const { user } = useUser();

  return useQuery({
    queryKey: documentsKeys.list(params),
    queryFn: () => documentsService.fetchDocuments(params),
    enabled: !!user,
  });
}

// ===========================
// Get Single Document
// ===========================

export function useDocument(id: string) {
  const { user } = useUser();

  return useQuery({
    queryKey: documentsKeys.detail(id),
    queryFn: () => documentsService.fetchDocument(id),
    enabled: !!user && !!id,
  });
}

// ===========================
// Get Document Versions
// ===========================

export function useDocumentVersions(id: string) {
  const { user } = useUser();

  return useQuery({
    queryKey: documentsKeys.versions(id),
    queryFn: () => documentsService.fetchDocumentVersions(id),
    enabled: !!user && !!id,
  });
}

// ===========================
// Create Document
// ===========================

export function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDocumentRequest) => documentsService.createDocument(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentsKeys.lists() });
    },
  });
}

// ===========================
// Update Document
// ===========================

export function useUpdateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDocumentRequest }) =>
      documentsService.updateDocument(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: documentsKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: documentsKeys.lists() });
    },
  });
}

// ===========================
// Delete Document
// ===========================

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => documentsService.deleteDocument(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: documentsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: documentsKeys.lists() });
    },
  });
}

// ===========================
// AI Revision
// ===========================

export function useReviseDocument() {
  return useMutation({
    mutationFn: ({
      id,
      instruction,
      currentContent,
    }: {
      id: string;
      instruction: string;
      currentContent: string;
    }) => documentsService.reviseDocument(id, instruction, currentContent),
  });
}

// ===========================
// Generate Document from Session
// ===========================

export function useGenerateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: GenerateDocumentRequest) => documentsService.generateDocument(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentsKeys.lists() });
    },
  });
}

// ===========================
// Enhance Document with Session
// ===========================

export function useEnhanceDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EnhanceDocumentRequest }) =>
      documentsService.enhanceDocument(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: documentsKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: documentsKeys.versions(variables.id) });
    },
  });
}

// ===========================
// Export to Notion
// ===========================

export function useExportToNotion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: ExportNotionRequest }) =>
      documentsService.exportToNotion(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: documentsKeys.detail(variables.id) });
    },
  });
}

// ===========================
// Export to Google Docs
// ===========================

export function useExportToGoogleDocs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId?: string }) =>
      documentsService.exportToGoogleDocs(id, folderId),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: documentsKeys.detail(variables.id) });
      await queryClient.invalidateQueries({ queryKey: documentsKeys.all });
    },
  });
}

// ===========================
// List Google Drive Folders
// ===========================

export function useGoogleDriveFolders() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["google-drive-folders"],
    queryFn: () => documentsService.fetchGoogleDriveFolders(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

