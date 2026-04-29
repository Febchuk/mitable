import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import { z } from "zod";

import { config } from "../../../config.js";
import { createLogger } from "../../shared-infra/lib/logger.js";
import type { ProposedUpdate, ProposedUpdatesEnvelope } from "../types/proposed-updates.js";
import {
    resolveStudent,
    type RosterStudent,
} from "./child-resolution.service.js";

const logger = createLogger({ module: "MontessoriInterpretation" });

/**
 * MontessoriInterpretationService — turns a teacher's input (text +/-
 * photo +/- audio) into a ProposedUpdatesEnvelope in a single Gemini
 * call. The teacher reviews and confirms the proposals before any
 * write hits the DB; this service never persists anything itself.
 *
 * Privacy note: the photo/audio bytes flow through this service in
 * memory only. We pass them to Gemini, parse the response, and drop
 * the references. Nothing is written to disk, blob storage, or any
 * DB column. The route handler in 2.4 enforces the same — multer is
 * configured for in-memory storage and the request handler runs the
 * call in a try/finally that nulls the buffer references.
 *
 * The OCR prompt is tuned for *physical* documents — handwritten
 * notes, printed worksheets, whiteboard photos — not computer
 * screenshots. That distinction shows up in the prompt language and
 * in the kinds of artefacts we tell the model to extract.
 */

// ─── Public interface ───────────────────────────────────────────────

export interface InterpretationTopic {
    id: string;
    name: string;
    domainId: string;
    domainName: string;
    level: "primary" | "elementary" | "both";
}

export interface InterpretationInput {
    /** Free-form text the teacher typed, or empty if they only sent a
     *  photo / audio capture. */
    text?: string | null;
    photo?: { bytes: Buffer; mimeType: string } | null;
    audio?: { bytes: Buffer; mimeType: string } | null;
    classroom: { id: string; name: string; level: "primary" | "elementary" | "both" };
    roster: RosterStudent[];
    topics: InterpretationTopic[];
    /** Today as YYYY-MM-DD in the school's local timezone — passed in
     *  rather than computed here so the route handler can be explicit
     *  about which day "today" means. */
    today: string;
}

export interface MontessoriInterpretationService {
    interpret(input: InterpretationInput): Promise<ProposedUpdatesEnvelope>;
}

// ─── Intermediate schema (what Gemini returns) ──────────────────────
//
// Gemini hands us studentName + topicName (both verbatim from the
// lists in the prompt). The service post-processes these into UUIDs
// using the deterministic resolver before returning the final
// envelope. This keeps Gemini honest — it can't invent a UUID, only
// pick from the names we showed it.

const baseLlmProposalShape = {
    proposalId: z.string().min(1),
    summary: z.string().min(1).max(280),
    sourceQuote: z.string().max(2000).nullable().optional(),
};

const LlmObservationSchema = z.object({
    ...baseLlmProposalShape,
    kind: z.literal("observation"),
    studentName: z.string().min(1),
    topicName: z.string().min(1),
    level: z.enum(["introduced", "practising", "mastered"]),
    note: z.string().max(2000).nullable(),
});

const LlmAttendanceSchema = z.object({
    ...baseLlmProposalShape,
    kind: z.literal("attendance"),
    studentName: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(["present", "absent"]),
    note: z.string().max(500).nullable(),
});

const LlmReportSectionSchema = z.object({
    domainName: z.string().min(1),
    narrative: z.string().min(1).max(4000),
});

const LlmReportDraftSchema = z.object({
    ...baseLlmProposalShape,
    kind: z.literal("report-draft"),
    studentName: z.string().min(1),
    type: z.enum(["end-of-term", "activity-update"]),
    reportSummary: z.string().max(4000).nullable(),
    sections: z.array(LlmReportSectionSchema),
});

const LlmEnvelopeSchema = z.object({
    summary: z.string().min(1).max(1000),
    proposals: z.array(
        z.discriminatedUnion("kind", [
            LlmObservationSchema,
            LlmAttendanceSchema,
            LlmReportDraftSchema,
        ])
    ),
    clarifyingQuestion: z.string().max(500).nullable().optional(),
});

// ─── Implementation ─────────────────────────────────────────────────

export class GeminiMontessoriInterpretationService implements MontessoriInterpretationService {
    private genAI: GoogleGenerativeAI;

    constructor() {
        this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    }

    async interpret(input: InterpretationInput): Promise<ProposedUpdatesEnvelope> {
        const model = this.genAI.getGenerativeModel({
            // 2.5 Flash supports text + image + audio in one call and
            // is fast enough for the in-app review loop.
            model: "gemini-2.5-flash",
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.2,
            },
        });

        const promptText = buildPrompt(input);
        const parts: Part[] = [{ text: promptText }];
        if (input.photo) {
            parts.push({
                inlineData: {
                    data: input.photo.bytes.toString("base64"),
                    mimeType: input.photo.mimeType,
                },
            });
        }
        if (input.audio) {
            parts.push({
                inlineData: {
                    data: input.audio.bytes.toString("base64"),
                    mimeType: input.audio.mimeType,
                },
            });
        }

        let raw: unknown;
        try {
            const result = await model.generateContent(parts);
            const text = result.response.text();
            raw = JSON.parse(text);
        } catch (error) {
            logger.error({ error }, "Gemini interpretation call failed");
            return {
                summary: "I couldn't process that input. Please try again.",
                proposals: [],
                clarifyingQuestion: null,
            };
        }

        const parsed = LlmEnvelopeSchema.safeParse(raw);
        if (!parsed.success) {
            logger.error(
                { issues: parsed.error.issues, raw },
                "Gemini interpretation returned invalid shape"
            );
            return {
                summary: "I had trouble structuring that response. Please try again.",
                proposals: [],
                clarifyingQuestion: null,
            };
        }

        return await postProcess(parsed.data, input);
    }
}

// ─── Prompt assembly ────────────────────────────────────────────────

function buildPrompt(input: InterpretationInput): string {
    const { classroom, roster, topics, today, text } = input;
    const rosterLines = roster.map((s) => `- ${s.name}`).join("\n");
    const topicLines = topics
        .map((t) => `- ${t.name} (domain: ${t.domainName})`)
        .join("\n");

    return [
        `You are the Mitable agent for a Montessori classroom assistant. The teacher has just captured a moment from their day — typed text, a photo of a *physical* document (handwritten note / printed worksheet / whiteboard), and/or an audio recording from inside the app. Your job is to turn that capture into a structured set of proposed updates the teacher can review and confirm.`,
        ``,
        `# Classroom`,
        `${classroom.name} (level: ${classroom.level})`,
        `Today: ${today}`,
        ``,
        `# Roster (use these names verbatim — never invent)`,
        rosterLines,
        ``,
        `# Topics in this classroom (use these names verbatim — never invent)`,
        topicLines,
        ``,
        `# Photo / audio handling`,
        `If a photo is attached, treat it as a *physical* document — not a computer screenshot. The photo may contain handwritten notes from the teacher, a child's worksheet, or a whiteboard. Use OCR judgement: handwriting can be messy, names can be misspelled, lines can wrap unexpectedly. Quote what you read in sourceQuote when you propose an update from it.`,
        `If audio is attached, transcribe internally and use the transcription as another source of teacher input. Quote the relevant sentence in sourceQuote.`,
        ``,
        `# What you can propose`,
        `1. observation — a child reached "introduced" / "practising" / "mastered" on a topic from the topic list above. Provide studentName and topicName from the lists.`,
        `2. attendance — a child is "present" or "absent" today (or on the date the teacher mentions; default to today).`,
        `3. report-draft — only when the teacher explicitly asks to draft a report. Provide studentName, type ("end-of-term" or "activity-update"), and one short section per relevant domain.`,
        ``,
        `# Rules`,
        `- Never invent students or topics. If a name is ambiguous or doesn't appear in the list, do NOT guess — set clarifyingQuestion to ask the teacher who they meant. Don't include a proposal for the unresolved reference.`,
        `- proposalId must be a short stable string (e.g. "p1", "p2") unique within this response.`,
        `- summary on each proposal is a one-line plain-English description for a review card ("Mark Amara as mastered on Pink Tower").`,
        `- sourceQuote (optional) is the exact slice of text/transcript/OCR you based the proposal on.`,
        `- The top-level summary is a 1-2 sentence narration of what you understood from the input.`,
        ``,
        `# Output`,
        `Respond with ONE JSON object matching this shape:`,
        `{ "summary": string, "proposals": Array<Observation | Attendance | ReportDraft>, "clarifyingQuestion"?: string | null }`,
        ``,
        `Each proposal carries a "kind" discriminator. Use exactly the field names above.`,
        ``,
        text ? `# Teacher's text\n${text}\n` : `# Teacher's text\n(none — only photo/audio attached)\n`,
    ].join("\n");
}

// ─── Post-processing: names → IDs ───────────────────────────────────

async function postProcess(
    llm: z.infer<typeof LlmEnvelopeSchema>,
    input: InterpretationInput
): Promise<ProposedUpdatesEnvelope> {
    const proposals: ProposedUpdate[] = [];
    const unresolvedReferences: string[] = [];

    for (const p of llm.proposals) {
        // Resolve the student via the deterministic stage only — Gemini
        // already had the roster in front of it; if its answer doesn't
        // match deterministically we'd rather punt than burn a second
        // LLM call for a name it should have copied verbatim.
        const studentRes = await resolveStudent({ candidate: p.studentName, roster: input.roster }, null);
        if (studentRes.kind !== "resolved") {
            unresolvedReferences.push(p.studentName);
            continue;
        }
        const student = studentRes.student;

        if (p.kind === "observation") {
            const topic = findTopicByName(input.topics, p.topicName);
            if (!topic) {
                unresolvedReferences.push(`${p.topicName} (topic)`);
                continue;
            }
            proposals.push({
                kind: "observation",
                proposalId: p.proposalId,
                summary: p.summary,
                sourceQuote: p.sourceQuote ?? null,
                studentId: student.id,
                studentName: student.name,
                topicId: topic.id,
                topicName: topic.name,
                domainName: topic.domainName,
                level: p.level,
                note: p.note,
            });
        } else if (p.kind === "attendance") {
            proposals.push({
                kind: "attendance",
                proposalId: p.proposalId,
                summary: p.summary,
                sourceQuote: p.sourceQuote ?? null,
                studentId: student.id,
                studentName: student.name,
                date: p.date,
                status: p.status,
                note: p.note,
            });
        } else {
            // report-draft
            const sections = [];
            for (const sec of p.sections) {
                const domain = findDomainByName(input.topics, sec.domainName);
                if (!domain) continue; // silently drop sections for unknown domains
                sections.push({
                    domainId: domain.id,
                    domainName: domain.name,
                    narrative: sec.narrative,
                });
            }
            proposals.push({
                kind: "report-draft",
                proposalId: p.proposalId,
                summary: p.summary,
                sourceQuote: p.sourceQuote ?? null,
                studentId: student.id,
                studentName: student.name,
                classroomId: input.classroom.id,
                type: p.type,
                reportSummary: p.reportSummary,
                sections,
            });
        }
    }

    // If post-processing dropped references, surface that as a
    // clarifying question — better to ask than to silently lose data.
    let clarifyingQuestion = llm.clarifyingQuestion ?? null;
    if (unresolvedReferences.length > 0 && !clarifyingQuestion) {
        const list = unresolvedReferences.map((r) => `"${r}"`).join(", ");
        clarifyingQuestion = `I couldn't match ${list} to anyone in your classroom. Who did you mean?`;
    }

    return {
        summary: llm.summary,
        proposals,
        clarifyingQuestion,
    };
}

function findTopicByName(
    topics: InterpretationTopic[],
    name: string
): InterpretationTopic | null {
    const norm = name.trim().toLowerCase();
    return topics.find((t) => t.name.trim().toLowerCase() === norm) ?? null;
}

function findDomainByName(
    topics: InterpretationTopic[],
    name: string
): { id: string; name: string } | null {
    const norm = name.trim().toLowerCase();
    const t = topics.find((t) => t.domainName.trim().toLowerCase() === norm);
    return t ? { id: t.domainId, name: t.domainName } : null;
}

// ─── Singleton ──────────────────────────────────────────────────────

export const montessoriInterpretationService = new GeminiMontessoriInterpretationService();
