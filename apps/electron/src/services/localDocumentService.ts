/**
 * Local Document Service
 *
 * Generates files entirely on-device:
 *   - Word (.docx) via `docx`
 *   - PDF (.pdf) via `pdf-lib`
 *   - Excel (.xlsx) via `exceljs`
 *   - Calendar (.ics) via `ical-generator`
 *
 * Maintains an in-memory temp store so generated files can be referenced
 * by ID from other tools (save_file_locally, upload_to_drive, send_email)
 * without passing large buffers through the LLM context.
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import ExcelJS from "exceljs";
import icalGenerator from "ical-generator";
import { createLogger } from "../lib/logger";

const logger = createLogger("LocalDocumentService");

const DOC_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface TempDocument {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  createdAt: number;
}

const tempDocStore = new Map<string, TempDocument>();

function cleanExpiredDocs(): void {
  const now = Date.now();
  for (const [id, doc] of tempDocStore) {
    if (now - doc.createdAt > DOC_TTL_MS) {
      tempDocStore.delete(id);
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────

export function getTempDocument(documentId: string): TempDocument | undefined {
  cleanExpiredDocs();
  return tempDocStore.get(documentId);
}

export async function generateDocxLocally(
  title: string,
  content: string
): Promise<{ documentId: string; fileName: string }> {
  const paragraphs = markdownToParagraphs(title, content);

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });

  const buffer = Buffer.from(await Packer.toBuffer(doc));
  const safeTitle = title.replace(/[^a-zA-Z0-9\s\-_]/g, "").trim();
  const fileName = `${safeTitle || "Document"}.docx`;

  cleanExpiredDocs();
  const documentId = crypto.randomUUID();
  tempDocStore.set(documentId, {
    buffer,
    fileName,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    createdAt: Date.now(),
  });

  logger.info(`Generated docx locally: ${fileName} (${buffer.length} bytes, id=${documentId})`);

  return { documentId, fileName };
}

// ─── PDF Generation ─────────────────────────────────────────────────────

export async function generatePdfLocally(
  title: string,
  content: string
): Promise<{ documentId: string; fileName: string }> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  // Courier reserved for future inline-code rendering
  void (await pdfDoc.embedFont(StandardFonts.Courier));

  const PAGE_WIDTH = 595.28; // A4
  const PAGE_HEIGHT = 841.89;
  const MARGIN = 50;
  const TEXT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
  const LINE_HEIGHT = 16;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function drawText(text: string, opts: { size: number; fontRef: typeof font; indent?: number }) {
    const maxChars = Math.floor(TEXT_WIDTH / (opts.size * 0.5));
    const words = text.split(" ");
    let line = "";

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (test.length > maxChars && line) {
        ensureSpace(opts.size + 4);
        page.drawText(line, {
          x: MARGIN + (opts.indent || 0),
          y,
          size: opts.size,
          font: opts.fontRef,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= LINE_HEIGHT * (opts.size / 12);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      ensureSpace(opts.size + 4);
      page.drawText(line, {
        x: MARGIN + (opts.indent || 0),
        y,
        size: opts.size,
        font: opts.fontRef,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= LINE_HEIGHT * (opts.size / 12);
    }
  }

  // Title
  drawText(title, { size: 22, fontRef: boldFont });
  y -= 8;

  // Date
  const dateStr = new Date().toLocaleDateString("en-US", { dateStyle: "long" });
  page.drawText(`Generated ${dateStr}`, {
    x: MARGIN,
    y,
    size: 9,
    font: italicFont,
    color: rgb(0.5, 0.5, 0.5),
  });
  y -= 24;

  // Content
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      y -= 8;
      continue;
    }

    const h1Match = trimmed.match(/^#\s+(.+)$/);
    if (h1Match) {
      y -= 12;
      drawText(h1Match[1], { size: 18, fontRef: boldFont });
      y -= 4;
      continue;
    }

    const h2Match = trimmed.match(/^##\s+(.+)$/);
    if (h2Match) {
      y -= 8;
      drawText(h2Match[1], { size: 15, fontRef: boldFont });
      y -= 2;
      continue;
    }

    const h3Match = trimmed.match(/^###\s+(.+)$/);
    if (h3Match) {
      y -= 6;
      drawText(h3Match[1], { size: 13, fontRef: boldFont });
      continue;
    }

    const bulletMatch = trimmed.match(/^[*-]\s+(.+)$/);
    if (bulletMatch) {
      const stripped = bulletMatch[1]
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`(.+?)`/g, "$1");
      ensureSpace(16);
      page.drawText("•", { x: MARGIN + 8, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
      drawText(stripped, { size: 11, fontRef: font, indent: 20 });
      continue;
    }

    const stripped = trimmed
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1");
    drawText(stripped, { size: 11, fontRef: font });
  }

  const pdfBytes = await pdfDoc.save();
  const buffer = Buffer.from(pdfBytes);
  const safeTitle = title.replace(/[^a-zA-Z0-9\s\-_]/g, "").trim();
  const fileName = `${safeTitle || "Document"}.pdf`;

  cleanExpiredDocs();
  const documentId = crypto.randomUUID();
  tempDocStore.set(documentId, {
    buffer,
    fileName,
    mimeType: "application/pdf",
    createdAt: Date.now(),
  });

  logger.info(`Generated PDF locally: ${fileName} (${buffer.length} bytes, id=${documentId})`);
  return { documentId, fileName };
}

// ─── Excel Generation ───────────────────────────────────────────────────

export async function generateSpreadsheetLocally(
  title: string,
  headers: string[],
  rows: string[][],
  sheetName?: string
): Promise<{ documentId: string; fileName: string }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mitable Agent";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName || title || "Sheet1");

  // Header row with styling
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true, size: 11 };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2D3748" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF4A5568" } },
    };
  });

  // Data rows
  for (const row of rows) {
    sheet.addRow(row);
  }

  // Auto-fit column widths (approximate)
  sheet.columns.forEach((col, i) => {
    const headerLen = headers[i]?.length || 10;
    const maxDataLen = rows.reduce((max, row) => Math.max(max, (row[i] || "").length), 0);
    col.width = Math.min(Math.max(headerLen, maxDataLen, 8) + 4, 50);
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const safeTitle = title.replace(/[^a-zA-Z0-9\s\-_]/g, "").trim();
  const fileName = `${safeTitle || "Spreadsheet"}.xlsx`;

  cleanExpiredDocs();
  const documentId = crypto.randomUUID();
  tempDocStore.set(documentId, {
    buffer,
    fileName,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    createdAt: Date.now(),
  });

  logger.info(
    `Generated spreadsheet locally: ${fileName} (${buffer.length} bytes, ${rows.length} rows, id=${documentId})`
  );
  return { documentId, fileName };
}

// ─── Calendar Event Generation ──────────────────────────────────────────

export interface CalendarEventParams {
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
}

export async function generateCalendarEventLocally(
  params: CalendarEventParams
): Promise<{ documentId: string; fileName: string }> {
  const calendar = icalGenerator({ name: "Mitable Agent" });

  const event = calendar.createEvent({
    start: new Date(params.start),
    end: new Date(params.end),
    summary: params.title,
    description: params.description,
    location: params.location,
  });

  if (params.attendees?.length) {
    for (const email of params.attendees) {
      event.createAttendee({ email });
    }
  }

  const icsString = calendar.toString();
  const buffer = Buffer.from(icsString, "utf-8");
  const safeTitle = params.title.replace(/[^a-zA-Z0-9\s\-_]/g, "").trim();
  const fileName = `${safeTitle || "Event"}.ics`;

  cleanExpiredDocs();
  const documentId = crypto.randomUUID();
  tempDocStore.set(documentId, {
    buffer,
    fileName,
    mimeType: "text/calendar",
    createdAt: Date.now(),
  });

  logger.info(`Generated calendar event locally: ${fileName} (id=${documentId})`);
  return { documentId, fileName };
}

// ─── Markdown → Paragraphs (for docx) ──────────────────────────────────

function markdownToParagraphs(title: string, content: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 32 })],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    })
  );

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated ${new Date().toLocaleDateString("en-US", { dateStyle: "long" })}`,
          italics: true,
          size: 20,
          color: "888888",
        }),
      ],
      spacing: { after: 400 },
    })
  );

  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      paragraphs.push(new Paragraph({ children: [] }));
      continue;
    }

    const h1Match = trimmed.match(/^#\s+(.+)$/);
    if (h1Match) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: h1Match[1], bold: true, size: 28 })],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 150 },
        })
      );
      continue;
    }

    const h2Match = trimmed.match(/^##\s+(.+)$/);
    if (h2Match) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: h2Match[1], bold: true, size: 24 })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 250, after: 120 },
        })
      );
      continue;
    }

    const h3Match = trimmed.match(/^###\s+(.+)$/);
    if (h3Match) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: h3Match[1], bold: true, size: 22 })],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        })
      );
      continue;
    }

    const bulletMatch = trimmed.match(/^[*-]\s+(.+)$/);
    if (bulletMatch) {
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(bulletMatch[1]),
          bullet: { level: 0 },
          spacing: { after: 60 },
        })
      );
      continue;
    }

    paragraphs.push(
      new Paragraph({
        children: parseInlineFormatting(trimmed),
        spacing: { after: 120 },
        alignment: AlignmentType.LEFT,
      })
    );
  }

  return paragraphs;
}

function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|([^*`]+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true }));
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4], italics: true }));
    } else if (match[6]) {
      runs.push(new TextRun({ text: match[6], font: "Courier New", size: 20, color: "CC4444" }));
    } else if (match[7]) {
      runs.push(new TextRun({ text: match[7] }));
    }
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text }));
  }

  return runs;
}
