import mammoth from "mammoth";
// pdf-parse v2: the CJS `.d.cts` (which tsc resolves) uses `export =` and
// omits the `PDFParse` named export, but the ESM build (loaded at runtime)
// does export it. We dynamic-import inside the function below to avoid the
// type mismatch at module load time.
type PDFParseCtor = new (opts: { data: Buffer }) => {
  getText(): Promise<{ text?: string }>;
};

import { createLogger } from "../../shared-infra/lib/logger.js";

const logger = createLogger({ module: "MontessoriTemplateParser" });

/**
 * TemplateParserService — pulls structure out of an admin-uploaded
 * report template. Two formats:
 *
 *   .docx — text extracted via mammoth. Placeholders use the
 *           docxtemplater default `{name}` syntax so the same
 *           document can later be filled by docxtemplater (5.2)
 *           without a syntax conversion step.
 *   .pdf  — text extracted via pdf-parse. PDFs aren't a fillable
 *           format, so we record the placeholders we *see* but the
 *           generator falls back to a programmatic render rather
 *           than trying to overlay text on the PDF.
 *
 * What we store on `montessori_report_templates.parsedStructure`:
 *   { placeholders: string[], sections: SectionMarker[],
 *     rawText: string }
 *
 * sections is a best-effort list of headings detected in the
 * source. The fill step uses sections to map domain narratives
 * into the right slots; the exact list is tolerant — extra
 * sections are ignored, missing ones get a generic placeholder.
 */

export interface ParsedTemplateStructure {
  placeholders: string[];
  sections: SectionMarker[];
  rawText: string;
}

export interface SectionMarker {
  /** Text of the heading (e.g. "Practical Life"). */
  heading: string;
  /** 1-based heading depth, in case a template nests sections. */
  depth: number;
}

const PLACEHOLDER_PATTERN = /\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}/g;

export async function parseTemplate(args: {
  bytes: Buffer;
  sourceFormat: "docx" | "pdf";
}): Promise<ParsedTemplateStructure> {
  const { bytes, sourceFormat } = args;

  if (sourceFormat === "docx") {
    return parseDocx(bytes);
  }
  return parsePdf(bytes);
}

async function parseDocx(bytes: Buffer): Promise<ParsedTemplateStructure> {
  // mammoth's convertToHtml lets us detect headings via h1/h2/h3
  // tags in addition to extracting plain text. The HTML pass is
  // cheap and gives us section markers for free.
  const [textResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ buffer: bytes }),
    mammoth.convertToHtml({ buffer: bytes }),
  ]);

  const rawText = textResult.value ?? "";
  const html = htmlResult.value ?? "";

  return {
    placeholders: extractPlaceholders(rawText),
    sections: extractDocxSections(html),
    rawText,
  };
}

async function parsePdf(bytes: Buffer): Promise<ParsedTemplateStructure> {
  let rawText = "";
  try {
    const mod = (await import("pdf-parse")) as unknown as { PDFParse: PDFParseCtor };
    const parser = new mod.PDFParse({ data: bytes });
    const result = await parser.getText();
    rawText = result.text ?? "";
  } catch (error) {
    logger.warn({ error }, "pdf-parse failed; storing empty rawText");
  }

  return {
    placeholders: extractPlaceholders(rawText),
    sections: extractPlainTextSections(rawText),
    rawText,
  };
}

function extractPlaceholders(text: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  PLACEHOLDER_PATTERN.lastIndex = 0;
  while ((match = PLACEHOLDER_PATTERN.exec(text)) !== null) {
    found.add(match[1]!);
  }
  return [...found];
}

function extractDocxSections(html: string): SectionMarker[] {
  // Lightweight DOM-free heading scan. We only care about h1..h3.
  const sections: SectionMarker[] = [];
  const re = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const depth = Number.parseInt(m[1]!, 10);
    const heading = stripHtml(m[2]!).trim();
    if (heading) sections.push({ heading, depth });
  }
  return sections;
}

function extractPlainTextSections(rawText: string): SectionMarker[] {
  // Heuristic for PDFs: lines that are short (<=80 chars), no
  // trailing period, and look "title-like" (first word
  // capitalised) get treated as headings. Imperfect but gives
  // generators something to anchor on.
  const sections: SectionMarker[] = [];
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.length > 80) continue;
    if (/[.!?]$/.test(line)) continue;
    if (!/^[A-Z]/.test(line)) continue;
    // Skip lines that look like body text (lots of lowercase).
    const lowercase = line.replace(/[^a-z]/g, "");
    const total = line.replace(/[^a-zA-Z]/g, "");
    if (total.length > 0 && lowercase.length / total.length > 0.85) continue;
    sections.push({ heading: line, depth: 1 });
  }
  return sections;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}
