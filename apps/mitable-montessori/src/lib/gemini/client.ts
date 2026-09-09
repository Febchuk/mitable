import { GoogleGenAI } from "@google/genai";

let cached: GoogleGenAI | null = null;

/**
 * Lazily-constructed Google GenAI client. The key is read from the environment
 * so it never reaches the browser. Student documents are sent only when an
 * administrator explicitly starts a reviewed import.
 */
export function getGemini(): GoogleGenAI {
  if (!cached) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    cached = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return cached;
}

/**
 * Cheapest current Gemini tier. Flash-Lite is fast and inexpensive, which suits
 * a short, tool-calling classroom assistant that mostly resolves names and
 * proposes one or two record edits per turn.
 */
export const GEMINI_MODEL = "gemini-3.5-flash";
