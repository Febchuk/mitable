/**
 * Documents Service
 *
 * API client for knowledge base documentation functionality.
 */

import { apiRequest } from "./api";
import type {
  Document,
  DocumentVersion,
  DocType,
  DocStatus,
  ListDocumentsResponse,
  CreateDocumentRequest,
  UpdateDocumentRequest,
  GenerateDocumentRequest,
  GenerateDocumentResponse,
  EnhanceDocumentRequest,
  EnhanceDocumentResponse,
  ReviseDocumentRequest,
  ReviseDocumentResponse,
  ExportNotionRequest,
  ExportNotionResponse,
} from "@mitable/shared";

// ===========================
// List Documents
// ===========================

export interface ListDocumentsParams {
  docType?: DocType;
  status?: DocStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export async function fetchDocuments(params?: ListDocumentsParams): Promise<ListDocumentsResponse> {
  const searchParams = new URLSearchParams();

  if (params?.docType) searchParams.set("docType", params.docType);
  if (params?.status) searchParams.set("status", params.status);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const query = searchParams.toString();
  const endpoint = `/documents${query ? `?${query}` : ""}`;

  return apiRequest<ListDocumentsResponse>(endpoint);
}

// ===========================
// Get Single Document
// ===========================

export async function fetchDocument(id: string): Promise<Document> {
  return apiRequest<Document>(`/documents/${id}`);
}

// ===========================
// Create Document
// ===========================

export async function createDocument(
  data: CreateDocumentRequest
): Promise<{ success: boolean; document: Document }> {
  return apiRequest<{ success: boolean; document: Document }>("/documents", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ===========================
// Update Document
// ===========================

export async function updateDocument(
  id: string,
  data: UpdateDocumentRequest
): Promise<{ success: boolean; document: Document }> {
  return apiRequest<{ success: boolean; document: Document }>(`/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ===========================
// Delete Document
// ===========================

export async function deleteDocument(id: string): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>(`/documents/${id}`, {
    method: "DELETE",
  });
}

// ===========================
// Get Document Versions
// ===========================

export async function fetchDocumentVersions(id: string): Promise<{ versions: DocumentVersion[] }> {
  return apiRequest<{ versions: DocumentVersion[] }>(`/documents/${id}/versions`);
}

// ===========================
// AI Revision
// ===========================

export async function reviseDocument(
  id: string,
  instruction: string,
  currentContent: string
): Promise<ReviseDocumentResponse> {
  const body: ReviseDocumentRequest = { instruction, currentContent };
  return apiRequest<ReviseDocumentResponse>(`/documents/${id}/revise`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ===========================
// Generate Document from Session
// ===========================

export async function generateDocument(
  data: GenerateDocumentRequest
): Promise<GenerateDocumentResponse> {
  return apiRequest<GenerateDocumentResponse>("/documents/generate", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ===========================
// Enhance Document with Session
// ===========================

export async function enhanceDocument(
  id: string,
  data: EnhanceDocumentRequest
): Promise<EnhanceDocumentResponse> {
  return apiRequest<EnhanceDocumentResponse>(`/documents/${id}/enhance`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ===========================
// Export to Notion
// ===========================

export async function exportToNotion(
  id: string,
  data?: ExportNotionRequest
): Promise<ExportNotionResponse> {
  return apiRequest<ExportNotionResponse>(`/documents/${id}/export-notion`, {
    method: "POST",
    body: JSON.stringify(data || {}),
  });
}

// ===========================
// Export to Google Docs
// ===========================

export async function exportToGoogleDocs(
  id: string,
  folderId?: string
): Promise<{ documentUrl: string; googleDocsId: string }> {
  return apiRequest<{ documentUrl: string; googleDocsId: string }>(
    `/documents/${id}/export-google-docs`,
    {
      method: "POST",
      body: JSON.stringify({ folderId }),
    }
  );
}

// ===========================
// List Google Drive Folders
// ===========================

export async function fetchGoogleDriveFolders(): Promise<{
  folders: Array<{ id: string; name: string; mimeType: string }>;
}> {
  return apiRequest<{ folders: Array<{ id: string; name: string; mimeType: string }> }>(
    "/documents/google-drive-folders"
  );
}
