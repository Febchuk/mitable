/**
 * Local Docs IPC Handlers
 *
 * File picker, parsing, chunking, indexing, and RAG query.
 */

import { ipcMain, dialog } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import { randomUUID } from "crypto";
import { stat } from "fs/promises";
import * as path from "path";
import { consoleLogger } from "../loggers";

export function registerLocalDocsHandlers() {
  // Pick a file, parse it, chunk it, index it
  ipcMain.handle(IPC_CHANNELS.LOCAL_DOCS_PICK_FILE, async () => {
    try {
      const { pgDb } = await import("../../services/on-device");

      const activeId = await pgDb.getUserPreference("system", "activeLocalUserId");
      if (!activeId) return { error: "No active user" };

      const { isSupportedFile, getSupportedExtensions } =
        await import("../../services/on-device/docParser");

      const exts = getSupportedExtensions();
      const result = await dialog.showOpenDialog({
        title: "Select a document",
        filters: [{ name: "Documents", extensions: exts.map((e) => e.replace(".", "")) }],
        properties: ["openFile"],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }

      const filePath = result.filePaths[0];
      if (!isSupportedFile(filePath)) {
        return { error: `Unsupported file type: ${path.extname(filePath)}` };
      }

      const fileStat = await stat(filePath);
      const docId = randomUUID();
      const fileName = path.basename(filePath);
      const fileType = path.extname(filePath).toLowerCase().replace(".", "");

      // Insert pending document
      if (!pgDb.isAvailable()) await pgDb.tryOpen();
      await pgDb.insertDocument({
        id: docId,
        userId: activeId,
        filePath,
        fileName,
        fileType,
        fileSize: fileStat.size,
        pageCount: 0,
        chunkCount: 0,
        status: "parsing",
        error: null,
        content: null,
        title: null,
      });

      // Parse and chunk in background
      processDocument(docId, filePath).catch((err) => {
        consoleLogger.error(`[LocalDocs] Failed to process ${fileName}:`, String(err));
      });

      return { document: await pgDb.getDocument(docId) };
    } catch (err) {
      return { error: String(err) };
    }
  });

  // List all documents for the current user
  ipcMain.handle(IPC_CHANNELS.LOCAL_DOCS_LIST, async () => {
    try {
      const { pgDb } = await import("../../services/on-device");
      if (!pgDb.isAvailable()) await pgDb.tryOpen();

      const activeId = await pgDb.getUserPreference("system", "activeLocalUserId");
      if (!activeId) return { documents: [] };

      return { documents: await pgDb.listDocuments(activeId) };
    } catch {
      return { documents: [] };
    }
  });

  // Delete a document
  ipcMain.handle(IPC_CHANNELS.LOCAL_DOCS_DELETE, async (_, docId: string) => {
    try {
      const { pgDb } = await import("../../services/on-device");
      if (!pgDb.isAvailable()) return { error: "DB unavailable" };

      const activeId = await pgDb.getUserPreference("system", "activeLocalUserId");
      if (!activeId) return { error: "No active user" };

      const deleted = await pgDb.deleteDocument(docId, activeId);
      return { success: deleted };
    } catch (err) {
      return { error: String(err) };
    }
  });

  // RAG query across all user's docs
  ipcMain.handle(IPC_CHANNELS.LOCAL_DOCS_QUERY, async (_, question: string) => {
    try {
      const { pgDb } = await import("../../services/on-device");
      if (!pgDb.isAvailable()) await pgDb.tryOpen();

      const activeId = await pgDb.getUserPreference("system", "activeLocalUserId");
      if (!activeId) return { error: "No active user" };

      const { queryDocs } = await import("../../services/on-device/docsRag");
      const result = await queryDocs(activeId, question);
      return result;
    } catch (err) {
      return { error: String(err) };
    }
  });

  // Get chunks for a specific document
  ipcMain.handle(IPC_CHANNELS.LOCAL_DOCS_GET_CHUNKS, async (_, docId: string) => {
    try {
      const { pgDb } = await import("../../services/on-device");
      if (!pgDb.isAvailable()) return { chunks: [] };

      return { chunks: await pgDb.getDocChunks(docId) };
    } catch {
      return { chunks: [] };
    }
  });

  // Generate a document using BYOK provider
  ipcMain.handle(
    IPC_CHANNELS.LOCAL_DOCS_GENERATE,
    async (_, prompt: string, sessionIds?: string[]) => {
      try {
        const { pgDb } = await import("../../services/on-device");
        if (!pgDb.isAvailable()) await pgDb.tryOpen();

        const activeId = await pgDb.getUserPreference("system", "activeLocalUserId");
        if (!activeId) return { error: "No active user" };

        const { generateDocument } = await import("../../services/on-device/docGenerator");

        const { content, title } = await generateDocument(prompt, sessionIds);

        const docId = randomUUID();
        await pgDb.insertDocument({
          id: docId,
          userId: activeId,
          filePath: "",
          fileName: title,
          fileType: "generated",
          fileSize: Buffer.byteLength(content, "utf-8"),
          pageCount: 1,
          chunkCount: 0,
          status: "ready",
          error: null,
          content,
          title,
        });

        // Chunk the generated content for search
        const { chunkText } = await import("../../services/on-device/docParser");
        const chunks = chunkText(content);
        const chunkRows = chunks.map((c) => ({
          id: randomUUID(),
          documentId: docId,
          chunkIndex: c.index,
          content: c.text,
          charStart: c.charStart,
          charEnd: c.charEnd,
        }));
        await pgDb.insertDocChunks(chunkRows);
        await pgDb.updateDocumentStatus(docId, "ready", { chunkCount: chunks.length });

        consoleLogger.info(
          `[LocalDocs] Generated document "${title}" (${docId}), ${chunks.length} chunks`
        );

        return { documentId: docId, title, content };
      } catch (err) {
        consoleLogger.error("[LocalDocs] Generation failed:", String(err));
        return { error: String(err) };
      }
    }
  );

  // Get a single document by ID
  ipcMain.handle(IPC_CHANNELS.LOCAL_DOCS_GET, async (_, docId: string) => {
    try {
      const { pgDb } = await import("../../services/on-device");
      if (!pgDb.isAvailable()) await pgDb.tryOpen();

      const doc = await pgDb.getDocument(docId);
      if (!doc) return { error: "Document not found" };
      return { document: doc };
    } catch (err) {
      return { error: String(err) };
    }
  });

  // Update document content and/or title
  ipcMain.handle(
    IPC_CHANNELS.LOCAL_DOCS_UPDATE,
    async (_, docId: string, data: { content?: string; title?: string }) => {
      try {
        const { pgDb } = await import("../../services/on-device");
        if (!pgDb.isAvailable()) return { error: "DB unavailable" };

        if (data.content !== undefined) {
          await pgDb.updateDocumentContent(docId, data.content, data.title);

          // Re-chunk for search
          const { chunkText } = await import("../../services/on-device/docParser");
          await pgDb.deleteDocChunks(docId);

          const chunks = chunkText(data.content);
          const chunkRows = chunks.map((c) => ({
            id: randomUUID(),
            documentId: docId,
            chunkIndex: c.index,
            content: c.text,
            charStart: c.charStart,
            charEnd: c.charEnd,
          }));
          await pgDb.insertDocChunks(chunkRows);
          await pgDb.updateDocumentStatus(docId, "ready", { chunkCount: chunks.length });
        } else if (data.title !== undefined) {
          // Title-only update: read current content to preserve it
          const existing = await pgDb.getDocument(docId);
          await pgDb.updateDocumentContent(docId, existing?.content ?? "", data.title);
        }

        return { success: true };
      } catch (err) {
        return { error: String(err) };
      }
    }
  );

  // AI revision of a document
  ipcMain.handle(
    IPC_CHANNELS.LOCAL_DOCS_REVISE,
    async (_, instruction: string, currentContent: string) => {
      try {
        const { reviseDocumentLocal } = await import("../../services/on-device/docGenerator");
        const result = await reviseDocumentLocal(instruction, currentContent);
        return result;
      } catch (err) {
        return { error: String(err) };
      }
    }
  );
}

async function processDocument(docId: string, filePath: string): Promise<void> {
  const { pgDb } = await import("../../services/on-device");
  const { parseDocument, chunkText } = await import("../../services/on-device/docParser");

  try {
    const parsed = await parseDocument(filePath);

    const chunks = chunkText(parsed.text);

    const chunkRows = chunks.map((c) => ({
      id: randomUUID(),
      documentId: docId,
      chunkIndex: c.index,
      content: c.text,
      charStart: c.charStart,
      charEnd: c.charEnd,
    }));

    await pgDb.insertDocChunks(chunkRows);

    await pgDb.updateDocumentStatus(docId, "ready", {
      chunkCount: chunks.length,
      pageCount: parsed.pageCount,
      error: null,
    });

    consoleLogger.info(
      `[LocalDocs] Indexed ${path.basename(filePath)}: ${parsed.pageCount} pages, ${chunks.length} chunks`
    );
  } catch (err) {
    await pgDb.updateDocumentStatus(docId, "error", {
      error: String(err),
    });
    throw err;
  }
}
