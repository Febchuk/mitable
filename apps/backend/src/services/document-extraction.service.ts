/**
 * Document Extraction Service
 *
 * Extracts text content from various document formats:
 * - PDF files using pdf-parse
 * - DOCX files using mammoth
 * - TXT/MD files via direct UTF-8 read
 * - Images return null (no text extraction)
 */

// Note: These packages need to be installed:
// npm install pdf-parse mammoth --workspace=apps/backend

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
   * Extract text from PDF files
   */
  private async extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
    try {
      // Dynamic import to handle optional dependency
      // @ts-ignore - pdf-parse types may not be available
      const pdfParse = (await import("pdf-parse")).default;

      const data = await pdfParse(buffer);

      const text = data.text.trim();
      const wordCount = this.countWords(text);

      console.log(
        `[DocumentExtraction] PDF extracted: ${data.numpages} pages, ${wordCount} words`
      );

      return {
        text,
        metadata: {
          pageCount: data.numpages,
          wordCount,
          characterCount: text.length,
          extractionMethod: "pdf-parse",
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
      // @ts-ignore - mammoth types may not be available
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
        return "pdf-parse";
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
