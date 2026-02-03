/**
 * Document Extraction Service
 *
 * Extracts text content from various document formats:
 * - PDF files using unpdf (Node.js-friendly pdfjs wrapper)
 * - DOCX files using mammoth
 * - TXT/MD files via direct UTF-8 read
 * - Images return null (no text extraction)
 */

import { extractText as extractPdfText } from "unpdf";

interface ExtractionResult {
  text: string | null;
  metadata: ExtractionMetadata;
}

interface ExtractionMetadata {
  pageCount?: number;
  wordCount?: number;
  characterCount?: number;
  encoding?: string;
  extractionMethod: string;
}

class DocumentExtractionService {
  /**
   * Extract text from a document buffer based on MIME type
   */
  async extractText(buffer: Buffer, mimeType: string): Promise<ExtractionResult> {
    console.log(`[DocumentExtraction] Extracting text from ${mimeType}`);

    switch (mimeType) {
      case "application/pdf":
        return this.extractFromPdf(buffer);

      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return this.extractFromDocx(buffer);

      case "text/plain":
      case "text/markdown":
        return this.extractFromText(buffer);

      default:
        // Images and other binary formats
        if (mimeType.startsWith("image/")) {
          console.log(`[DocumentExtraction] Image type ${mimeType} - skipping text extraction`);
          return {
            text: null,
            metadata: {
              extractionMethod: "skipped",
            },
          };
        }

        console.warn(`[DocumentExtraction] Unsupported MIME type: ${mimeType}`);
        return {
          text: null,
          metadata: {
            extractionMethod: "unsupported",
          },
        };
    }
  }

  /**
   * Extract text from PDF files using unpdf
   */
  private async extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
    try {
      // Convert Buffer to Uint8Array as required by unpdf
      const uint8Array = new Uint8Array(buffer);
      const result = await extractPdfText(uint8Array);

      // unpdf returns { text: string, totalPages: number } but text might be array or object
      // Handle different response formats
      let textContent: string;
      let pageCount: number;

      if (typeof result === "string") {
        textContent = result;
        pageCount = 1;
      } else if (result && typeof result === "object") {
        // Result is an object with text property
        if (typeof result.text === "string") {
          textContent = result.text;
        } else if (Array.isArray(result.text)) {
          // Text is array of page texts
          textContent = result.text.join("\n\n");
        } else {
          textContent = String(result.text || "");
        }
        pageCount = result.totalPages || 1;
      } else {
        textContent = "";
        pageCount = 0;
      }

      const cleanedText = textContent.trim();
      const wordCount = this.countWords(cleanedText);

      console.log(`[DocumentExtraction] PDF extracted: ${pageCount} pages, ${wordCount} words`);

      return {
        text: cleanedText,
        metadata: {
          pageCount,
          wordCount,
          characterCount: cleanedText.length,
          extractionMethod: "unpdf",
        },
      };
    } catch (error) {
      console.error("[DocumentExtraction] PDF extraction failed:", error);
      throw new Error(
        `PDF extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Extract text from DOCX files
   */
  private async extractFromDocx(buffer: Buffer): Promise<ExtractionResult> {
    try {
      // Dynamic import to handle optional dependency
      const mammoth = await import("mammoth");

      const result = await mammoth.extractRawText({ buffer });

      const text = result.value.trim();
      const wordCount = this.countWords(text);

      // Log any warnings from mammoth
      if (result.messages.length > 0) {
        console.log(
          "[DocumentExtraction] DOCX warnings:",
          result.messages.map((m: { message: string }) => m.message).join(", ")
        );
      }

      console.log(`[DocumentExtraction] DOCX extracted: ${wordCount} words`);

      return {
        text,
        metadata: {
          wordCount,
          characterCount: text.length,
          extractionMethod: "mammoth",
        },
      };
    } catch (error) {
      console.error("[DocumentExtraction] DOCX extraction failed:", error);
      throw new Error(
        `DOCX extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Extract text from plain text files
   */
  private async extractFromText(buffer: Buffer): Promise<ExtractionResult> {
    try {
      // Try UTF-8 first, then fallback to latin1
      let text: string;
      let encoding = "utf-8";

      try {
        text = buffer.toString("utf-8").trim();
        // Check for UTF-8 BOM and remove it
        if (text.charCodeAt(0) === 0xfeff) {
          text = text.slice(1);
        }
      } catch {
        text = buffer.toString("latin1").trim();
        encoding = "latin1";
      }

      const wordCount = this.countWords(text);

      console.log(`[DocumentExtraction] Text file extracted: ${wordCount} words (${encoding})`);

      return {
        text,
        metadata: {
          wordCount,
          characterCount: text.length,
          encoding,
          extractionMethod: "direct",
        },
      };
    } catch (error) {
      console.error("[DocumentExtraction] Text extraction failed:", error);
      throw new Error(
        `Text extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter((word) => word.length > 0).length;
  }

  /**
   * Truncate text to fit within token limits
   * Approximate: 1 token ≈ 4 characters for English text
   */
  truncateForTokenLimit(text: string, maxTokens: number = 6000): string {
    const maxChars = maxTokens * 4;

    if (text.length <= maxChars) {
      return text;
    }

    // Truncate and add indicator
    const truncated = text.slice(0, maxChars - 50);
    const lastParagraph = truncated.lastIndexOf("\n\n");
    const lastSentence = truncated.lastIndexOf(". ");

    // Try to break at paragraph or sentence boundary
    let breakPoint = maxChars - 50;
    if (lastParagraph > maxChars * 0.8) {
      breakPoint = lastParagraph;
    } else if (lastSentence > maxChars * 0.8) {
      breakPoint = lastSentence + 1;
    }

    return truncated.slice(0, breakPoint) + "\n\n[Content truncated due to length...]";
  }

  /**
   * Check if extraction is supported for a MIME type
   */
  supportsExtraction(mimeType: string): boolean {
    const supportedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
    ];
    return supportedTypes.includes(mimeType);
  }

  /**
   * Get extraction method for MIME type
   */
  getExtractionMethod(mimeType: string): string {
    switch (mimeType) {
      case "application/pdf":
        return "unpdf";
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return "mammoth";
      case "text/plain":
      case "text/markdown":
        return "direct";
      default:
        return "none";
    }
  }
}

// Export singleton
export const documentExtractionService = new DocumentExtractionService();
