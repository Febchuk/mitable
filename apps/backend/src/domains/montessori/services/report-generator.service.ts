import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
// pdfmake is a CJS module that exports a singleton instance with a
// stateful setFonts + createPdf API. It's intentional that we import
// the default and call methods on it rather than constructing a
// PdfPrinter (the older API was removed in 0.3+).
import pdfmake from "pdfmake";

import { createLogger } from "../../shared-infra/lib/logger.js";
import {
    downloadBytes,
    reportArtefactPath,
    uploadBytes,
} from "./template-storage.service.js";

const logger = createLogger({ module: "MontessoriReportGenerator" });

/**
 * ReportGenerator — turns an approved report draft + an optional
 * admin-uploaded template into downloadable DOCX + PDF artefacts in
 * Supabase Storage.
 *
 * - DOCX: requires a .docx template (placeholders use docxtemplater's
 *   default {name} delimiters). PDF templates aren't fillable, so a
 *   PDF-template (or no-template) report can only be downloaded as
 *   PDF in this commit.
 * - PDF: always generated programmatically with pdfmake using the
 *   PDF Standard 14 Helvetica family (no font files to ship). The
 *   layout mirrors the section structure from the report so the
 *   output reads like a real progress report even when there's no
 *   template.
 *
 * The service writes finished artefacts to Supabase Storage at the
 * paths returned by reportArtefactPath() and is the only place that
 * mints those paths — callers update montessori_reports.generatedX
 * with whatever it returns.
 */

// pdfmake's setFonts is global state. Set once; idempotent re-sets
// are cheap.
pdfmake.setFonts({
    Helvetica: {
        normal: "Helvetica",
        bold: "Helvetica-Bold",
        italics: "Helvetica-Oblique",
        bolditalics: "Helvetica-BoldOblique",
    },
});
// Refuse network fetches when generating PDFs — we never want a
// report build to phone home for an external image.
pdfmake.setUrlAccessPolicy(() => false);

export interface ReportContext {
    studentName: string;
    classroomName: string;
    schoolName: string;
    /** Null when the classroom has no teacher assigned. */
    teacherName: string | null;
    /** Human-readable date string for the title page. */
    date: string;
    /** "End-of-term report" or "Activity update". */
    reportType: string;
    /** Top-of-report narrative. May be empty string. */
    summary: string;
    sections: Array<{ domainName: string; narrative: string }>;
}

export interface GenerateArgs {
    reportId: string;
    organizationId: string;
    context: ReportContext;
    /** Storage path of the admin-uploaded template. Null when the
     *  admin hasn't uploaded one. */
    templateStoragePath: string | null;
    /** "docx" | "pdf" | null (matches templateStoragePath). PDF and
     *  null skip the DOCX render — see the file header. */
    templateFormat: "docx" | "pdf" | null;
}

export interface GenerateResult {
    docxPath: string | null;
    pdfPath: string;
}

export async function generateReportArtefacts(args: GenerateArgs): Promise<GenerateResult> {
    const { reportId, organizationId, context, templateStoragePath, templateFormat } = args;

    // ── DOCX: only when an admin uploaded a .docx template ──────
    let docxPath: string | null = null;
    if (templateFormat === "docx" && templateStoragePath) {
        try {
            const templateBytes = await downloadBytes(templateStoragePath);
            const docxBytes = renderDocxFromTemplate(templateBytes, context);
            docxPath = reportArtefactPath({ organizationId, reportId, format: "docx" });
            await uploadBytes({
                path: docxPath,
                bytes: docxBytes,
                contentType:
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            });
        } catch (error) {
            logger.error({ error, reportId }, "DOCX generation failed; PDF will still be produced");
            docxPath = null;
        }
    }

    // ── PDF: always generated programmatically ──────────────────
    const pdfBytes = await renderPdf(context);
    const pdfPath = reportArtefactPath({ organizationId, reportId, format: "pdf" });
    await uploadBytes({
        path: pdfPath,
        bytes: pdfBytes,
        contentType: "application/pdf",
    });

    return { docxPath, pdfPath };
}

// ─── DOCX via docxtemplater ─────────────────────────────────────────

function renderDocxFromTemplate(templateBytes: Buffer, context: ReportContext): Buffer {
    const zip = new PizZip(templateBytes);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        // We deliberately don't supply nullGetter — let docxtemplater's
        // default ("undefined") flag missing placeholders so the admin
        // can fix the template rather than ship reports with literal
        // "undefined" in them.
    });

    doc.render({
        ...context,
        // Sections are exposed as a docxtemplater loop:
        //   {#sections}
        //     {domainName}
        //     {narrative}
        //   {/sections}
        sections: context.sections.map((s) => ({
            domainName: s.domainName,
            narrative: s.narrative,
        })),
    });

    const out = doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE",
    });
    return out as Buffer;
}

// ─── PDF via pdfmake ────────────────────────────────────────────────

async function renderPdf(context: ReportContext): Promise<Buffer> {
    const sectionBlocks = context.sections.flatMap((s) => [
        { text: s.domainName, style: "sectionHeading" },
        { text: s.narrative, style: "body" },
    ]);

    const docDefinition = {
        info: {
            title: `${context.studentName} — ${context.reportType}`,
            author: context.schoolName,
        },
        defaultStyle: { font: "Helvetica", fontSize: 11, lineHeight: 1.4 },
        styles: {
            schoolName: { fontSize: 10, color: "#666666", margin: [0, 0, 0, 6] },
            title: { fontSize: 18, bold: true, margin: [0, 0, 0, 4] },
            subtitle: { fontSize: 12, color: "#444444", margin: [0, 0, 0, 12] },
            meta: { fontSize: 10, color: "#666666", margin: [0, 0, 0, 12] },
            sectionHeading: {
                fontSize: 12,
                bold: true,
                margin: [0, 12, 0, 4],
            },
            body: { fontSize: 11, margin: [0, 0, 0, 8] },
        },
        content: [
            { text: context.schoolName, style: "schoolName" },
            { text: context.studentName, style: "title" },
            { text: context.reportType, style: "subtitle" },
            {
                text: [
                    { text: "Classroom: ", bold: true },
                    context.classroomName,
                    "    ",
                    { text: "Date: ", bold: true },
                    context.date,
                    ...(context.teacherName
                        ? ["    ", { text: "Teacher: ", bold: true }, context.teacherName]
                        : []),
                ],
                style: "meta",
            },
            ...(context.summary
                ? [{ text: context.summary, style: "body", margin: [0, 0, 0, 12] }]
                : []),
            ...sectionBlocks,
        ],
        pageMargins: [56, 56, 56, 56],
    };

    const doc = pdfmake.createPdf(docDefinition);
    const buffer = await doc.getBuffer();
    return buffer instanceof Buffer ? buffer : Buffer.from(buffer);
}
