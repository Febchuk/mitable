import { GoogleGenerativeAI } from "@google/generative-ai";

import { config } from "../../../config.js";
import { createLogger } from "../../shared-infra/lib/logger.js";
import {
    RosterMatchResponseSchema,
    type RosterMatchClient,
    type RosterMatchResponse,
} from "./child-resolution.service.js";

const logger = createLogger({ module: "GeminiRosterMatch" });

/**
 * Gemini-backed RosterMatchClient. Constrained-output prompt with a
 * tiny JSON shape — we never let the model invent names, only pick
 * from the roster (or say "ambiguous" / "unresolved").
 *
 * Kept separate from ChildResolutionService so tests can stub the
 * client interface without touching the network.
 */
export class GeminiRosterMatchClient implements RosterMatchClient {
    private genAI: GoogleGenerativeAI;

    constructor() {
        this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    }

    async match(args: {
        candidate: string;
        rosterNames: string[];
        context?: string;
    }): Promise<RosterMatchResponse> {
        const { candidate, rosterNames, context } = args;

        const model = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash-lite",
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0,
            },
        });

        const prompt = [
            `You are matching a free-form student reference to a name in a Montessori classroom roster.`,
            ``,
            `Roster (each name is the canonical full form; pick from this set only):`,
            ...rosterNames.map((n) => `- ${n}`),
            ``,
            `Reference written or spoken by the teacher: "${candidate}"`,
            context ? `Context: ${context}` : ``,
            ``,
            `Rules:`,
            `1. If exactly one roster name is the obvious match (including misspellings, nicknames, partial names), respond {"matched": "<exact roster name>"}.`,
            `2. If two or more roster names could reasonably match, respond {"ambiguous": ["<name>", "<name>", ...]} — at least 2 names from the roster.`,
            `3. If no roster name is plausible, respond {"unresolved": "<short reason>"}.`,
            `Do not invent names. Only return names that appear verbatim in the roster.`,
            ``,
            `Respond with ONE JSON object.`,
        ].join("\n");

        let text = "";
        try {
            const result = await model.generateContent(prompt);
            text = result.response.text();
        } catch (error) {
            logger.error({ error, candidate }, "Gemini roster match call failed");
            return { unresolved: "llm_call_failed" };
        }

        let raw: unknown;
        try {
            raw = JSON.parse(text);
        } catch {
            logger.error({ text, candidate }, "Gemini roster match returned non-JSON");
            return { unresolved: "llm_invalid_json" };
        }

        const parsed = RosterMatchResponseSchema.safeParse(raw);
        if (!parsed.success) {
            logger.error(
                { issues: parsed.error.issues, raw, candidate },
                "Gemini roster match response failed schema"
            );
            return { unresolved: "llm_invalid_response_shape" };
        }
        return parsed.data;
    }
}

export const geminiRosterMatchClient = new GeminiRosterMatchClient();
