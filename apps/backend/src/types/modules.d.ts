/**
 * Type declarations for packages without built-in types
 */

// pdf-parse types
declare module "pdf-parse" {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: {
      Title?: string;
      Author?: string;
      Subject?: string;
      Creator?: string;
      Producer?: string;
      CreationDate?: string;
      ModDate?: string;
      [key: string]: string | undefined;
    };
    metadata: Record<string, unknown>;
    text: string;
    version: string;
  }

  interface PDFOptions {
    pagerender?: (pageData: {
      pageIndex: number;
      pageInfo: { num: number };
      getTextContent: () => Promise<{ items: Array<{ str: string }> }>;
    }) => Promise<string>;
    max?: number;
    version?: string;
  }

  function pdfParse(dataBuffer: Buffer, options?: PDFOptions): Promise<PDFData>;
  export = pdfParse;
}

// mammoth types
declare module "mammoth" {
  interface ConversionResult {
    value: string;
    messages: Array<{
      type: string;
      message: string;
      error?: Error;
    }>;
  }

  interface ConversionOptions {
    styleMap?: string | string[];
    includeEmbeddedStyleMap?: boolean;
    includeDefaultStyleMap?: boolean;
    convertImage?: (image: {
      read: (encoding: string) => Promise<Buffer>;
      contentType: string;
    }) => Promise<{ src: string }>;
    ignoreEmptyParagraphs?: boolean;
    idPrefix?: string;
  }

  function convertToHtml(
    input: { buffer: Buffer } | { path: string },
    options?: ConversionOptions
  ): Promise<ConversionResult>;

  function convertToMarkdown(
    input: { buffer: Buffer } | { path: string },
    options?: ConversionOptions
  ): Promise<ConversionResult>;

  function extractRawText(input: { buffer: Buffer } | { path: string }): Promise<ConversionResult>;

  export { convertToHtml, convertToMarkdown, extractRawText };
}
