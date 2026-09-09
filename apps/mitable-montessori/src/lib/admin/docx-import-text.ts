import { inflateRawSync } from "node:zlib";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const WORD_DOCUMENT_XML = "word/document.xml";
const MAX_ENTRIES = 10_000;
const MAX_EXTRACTED_BYTES = 750_000;

export class DocxImportTextError extends Error {}

/**
 * Extracts the main Word document XML without writing a temporary file.
 * DOCX is a ZIP package; this deliberately handles only the small, standard
 * subset needed for a roster and rejects oversized or malformed archives.
 */
export function docxBufferToImportText(buffer: Buffer): string {
  const centralDirectoryOffset = findCentralDirectoryOffset(buffer);
  let offset = centralDirectoryOffset;
  let entriesRead = 0;

  while (offset + 46 <= buffer.length && entriesRead < MAX_ENTRIES) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY) break;
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const entryEnd = offset + 46 + fileNameLength + extraLength + commentLength;
    if (entryEnd > buffer.length) throw new DocxImportTextError("The Word document is malformed.");

    const name = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength);
    if (name === WORD_DOCUMENT_XML) {
      if (uncompressedSize > MAX_EXTRACTED_BYTES) {
        throw new DocxImportTextError(
          "This Word document is too large to review at once. Split it into smaller rosters and try again."
        );
      }
      const xml = unzipEntry(buffer, {
        compression,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      });
      const text = wordDocumentXmlToImportText(xml.toString("utf8"));
      if (!text) {
        throw new DocxImportTextError(
          "This Word document did not contain readable student information."
        );
      }
      return text;
    }

    offset = entryEnd;
    entriesRead += 1;
  }

  throw new DocxImportTextError(
    "This Word document does not contain its main document text. Try saving it again as a DOCX or PDF."
  );
}

export function wordDocumentXmlToImportText(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<(?:w:tab)(?:\s[^>]*)?\/?\s*>/gi, "\t")
      .replace(/<(?:w:br|w:cr)(?:\s[^>]*)?\/?\s*>/gi, "\n")
      .replace(/<\/w:tc>/gi, "\t")
      .replace(/<\/w:tr>/gi, "\n")
      .replace(/<\/w:p>/gi, " ")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\t/g, "\t")
    .replace(/\t[ \t]+/g, "\t")
    .replace(/\t{2,}/g, "\t")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findCentralDirectoryOffset(buffer: Buffer): number {
  const firstPossible = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= firstPossible; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== END_OF_CENTRAL_DIRECTORY) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength !== buffer.length) continue;
    const entries = buffer.readUInt16LE(offset + 10);
    const centralDirectoryOffset = buffer.readUInt32LE(offset + 16);
    if (entries > MAX_ENTRIES || centralDirectoryOffset >= buffer.length) break;
    return centralDirectoryOffset;
  }
  throw new DocxImportTextError("This file is not a readable DOCX document.");
}

function unzipEntry(
  archive: Buffer,
  entry: {
    compression: number;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
  }
): Buffer {
  const { localHeaderOffset, compressedSize, compression, uncompressedSize } = entry;
  if (
    localHeaderOffset + 30 > archive.length ||
    archive.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_HEADER
  ) {
    throw new DocxImportTextError("The Word document is malformed.");
  }
  const fileNameLength = archive.readUInt16LE(localHeaderOffset + 26);
  const extraLength = archive.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + compressedSize;
  if (dataEnd > archive.length) throw new DocxImportTextError("The Word document is malformed.");

  let content: Buffer;
  if (compression === 0) {
    content = archive.subarray(dataStart, dataEnd);
  } else if (compression === 8) {
    try {
      content = inflateRawSync(archive.subarray(dataStart, dataEnd), {
        maxOutputLength: MAX_EXTRACTED_BYTES,
      });
    } catch {
      throw new DocxImportTextError("The Word document could not be unpacked.");
    }
  } else {
    throw new DocxImportTextError("This Word document uses an unsupported compression format.");
  }

  if (content.length > MAX_EXTRACTED_BYTES || content.length !== uncompressedSize) {
    throw new DocxImportTextError("The Word document is malformed or too large to review.");
  }
  return content;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => codePoint(hex, 16))
    .replace(/&#(\d+);/g, (_match, decimal: string) => codePoint(decimal, 10))
    .replace(/&(amp|lt|gt|quot|apos);/gi, (_match, entity: string) => {
      const values: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
      return values[entity.toLowerCase()] ?? "";
    });
}

function codePoint(value: string, radix: number): string {
  const parsed = Number.parseInt(value, radix);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff
    ? String.fromCodePoint(parsed)
    : "";
}
