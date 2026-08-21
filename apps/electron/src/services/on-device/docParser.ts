/**
 * Document Parser
 *
 * Extracts text from PDF, DOCX, PPTX, XLSX, ODT, ODP, ODS, RTF files.
 * - PDFs: pdf-oxide (Rust N-API, ~0.8ms per page)
 * - Everything else: officeparser (pure JS, AST-based)
 *
 * After extraction, text is split into chunks for FTS5 indexing and RAG.
 */

import * as path from "path";
import { createLogger } from "../../lib/logger";

const logger = createLogger("DocParser");

const PDF_EXTENSIONS = new Set([".pdf"]);
const OFFICE_EXTENSIONS = new Set([".docx", ".pptx", ".xlsx", ".odt", ".odp", ".ods", ".rtf"]);

export interface ParsedDocument {
  text: string;
  pageCount: number;
  metadata: Record<string, string>;
}

export interface TextChunk {
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
}

// ── PDF extraction via pdf-oxide ─────────────────────────────────────

async function extractPdf(filePath: string): Promise<ParsedDocument> {
  const { PdfDocument } = await import("pdf-oxide");
  const doc = new PdfDocument(filePath);

  try {
    const pageCount = doc.getPageCount();
    const pages: string[] = [];

    for (let i = 0; i < pageCount; i++) {
      pages.push(doc.extractText(i));
    }

    return {
      text: pages.join("\n\n"),
      pageCount,
      metadata: {},
    };
  } finally {
    doc.close();
  }
}

// ── Office extraction via officeparser ───────────────────────────────

async function extractOffice(filePath: string): Promise<ParsedDocument> {
  const { parseOffice } = await import("officeparser");
  const result = await parseOffice(filePath, { newlineDelimiter: "\n" });

  const text = typeof result === "string" ? result : String(result);

  return {
    text,
    pageCount: 1,
    metadata: {},
  };
}

// ── Public API ───────────────────────────────────────────────────────

export function isSupportedFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return PDF_EXTENSIONS.has(ext) || OFFICE_EXTENSIONS.has(ext);
}

export function getSupportedExtensions(): string[] {
  return [...PDF_EXTENSIONS, ...OFFICE_EXTENSIONS];
}

export async function parseDocument(filePath: string): Promise<ParsedDocument> {
  const ext = path.extname(filePath).toLowerCase();

  if (PDF_EXTENSIONS.has(ext)) {
    logger.info(`Parsing PDF: ${path.basename(filePath)}`);
    return extractPdf(filePath);
  }

  if (OFFICE_EXTENSIONS.has(ext)) {
    logger.info(`Parsing Office doc: ${path.basename(filePath)}`);
    return extractOffice(filePath);
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

// ── Chunking ─────────────────────────────────────────────────────────

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 200;

export function chunkText(
  text: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_CHUNK_OVERLAP
): TextChunk[] {
  if (!text.trim()) return [];

  const chunks: TextChunk[] = [];
  const paragraphs = text.split(/\n{2,}/);
  let current = "";
  let charStart = 0;
  for (const para of paragraphs) {
    const paraWithSep = para + "\n\n";

    if (current.length + paraWithSep.length > chunkSize && current.length > 0) {
      chunks.push({
        index: chunks.length,
        text: current.trim(),
        charStart,
        charEnd: charStart + current.trimEnd().length,
      });

      const overlapText = current.slice(-overlap);
      charStart = charStart + current.length - overlapText.length;
      current = overlapText;
    }

    current += paraWithSep;
  }

  if (current.trim()) {
    chunks.push({
      index: chunks.length,
      text: current.trim(),
      charStart,
      charEnd: charStart + current.trimEnd().length,
    });
  }

  return chunks;
}
