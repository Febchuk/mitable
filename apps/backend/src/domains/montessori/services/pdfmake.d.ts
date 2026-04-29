// Local pdfmake typings.
//
// We deliberately do NOT use @types/pdfmake — its interfaces.d.ts
// has `/// <reference lib="dom" />` at the top which pulls lib.dom
// into the entire backend's type space and breaks the unrelated
// `Headers.entries()` typing in apps/backend/src/domains/agent/
// routes/agent.ts (the undici Headers shim collapses to {} when
// globalThis matches the DOM shape).
//
// This module declaration captures only the surface we use in
// report-generator.service.ts.

declare module "pdfmake" {
    interface PdfFontDefinition {
        normal: string;
        bold: string;
        italics: string;
        bolditalics: string;
    }

    interface PdfDocument {
        getBuffer(): Promise<Buffer>;
    }

    interface PdfMakeStatic {
        setFonts(fonts: Record<string, PdfFontDefinition>): void;
        setUrlAccessPolicy(callback: (url: string) => boolean): void;
        // Loose typing on docDefinition — we trust the caller. The
        // structural type of the official docs is exhaustive enough
        // that mirroring it here would be a big copy-paste.
        createPdf(docDefinition: Record<string, unknown>): PdfDocument;
    }

    const pdfmake: PdfMakeStatic;
    export default pdfmake;
}
