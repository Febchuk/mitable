/**
 * Type declarations for packages without built-in types
 */

import { Request, RequestHandler } from "express";

// Extend Express Request to include multer file
declare global {
  namespace Express {
    interface Request {
      file?: Multer.File;
      files?: { [fieldname: string]: Multer.File[] } | Multer.File[];
    }
    namespace Multer {
      interface File {
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        size: number;
        destination: string;
        filename: string;
        path: string;
        buffer: Buffer;
      }
    }
  }
}

// multer types
declare module "multer" {
  import { Request, RequestHandler } from "express";

  interface StorageEngine {
    _handleFile(
      req: Request,
      file: Express.Multer.File,
      callback: (error?: Error | null, info?: Partial<Express.Multer.File>) => void
    ): void;
    _removeFile(req: Request, file: Express.Multer.File, callback: (error: Error | null) => void): void;
  }

  interface DiskStorageOptions {
    destination?: string | ((req: Request, file: Express.Multer.File, callback: (error: Error | null, destination: string) => void) => void);
    filename?: (req: Request, file: Express.Multer.File, callback: (error: Error | null, filename: string) => void) => void;
  }

  interface Options {
    dest?: string;
    storage?: StorageEngine;
    limits?: {
      fieldNameSize?: number;
      fieldSize?: number;
      fields?: number;
      fileSize?: number;
      files?: number;
      parts?: number;
      headerPairs?: number;
    };
    preservePath?: boolean;
    fileFilter?: (req: Request, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void) => void;
  }

  interface Multer {
    (options?: Options): RequestHandler;
    single(fieldname: string): RequestHandler;
    array(fieldname: string, maxCount?: number): RequestHandler;
    fields(fields: Array<{ name: string; maxCount?: number }>): RequestHandler;
    none(): RequestHandler;
    any(): RequestHandler;
  }

  interface MulterStatic extends Multer {
    diskStorage(options: DiskStorageOptions): StorageEngine;
    memoryStorage(): StorageEngine;
  }

  const multer: MulterStatic;
  export = multer;
}

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

  function extractRawText(
    input: { buffer: Buffer } | { path: string }
  ): Promise<ConversionResult>;

  export { convertToHtml, convertToMarkdown, extractRawText };
}
