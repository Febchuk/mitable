import { transcribeAudio } from "./whisper";
import { ocrImage } from "./tesseract";
import { fuzzyMatchRoster, type RosterEntry, type TokenMapEntry } from "./tokenize";

export type ParseInputs = {
  audio: Blob | null;
  noteImages: Blob[];
  roster: RosterEntry[];
};

export type ParseOutputs = {
  transcripts: string[];
  notes: string[];
  tokenMap: TokenMapEntry[];
};

/**
 * Run client-side capture parsing for the new-report flow:
 *  - Whisper for audio → transcript
 *  - Tesseract for note images → OCR text
 *  - fuzzy-match against roster → tokenize names with [STUDENT_n]
 *
 * Until the whisper/tesseract deps are wired up the parsers return empty
 * strings, which is fine — the agent still has the existing observation
 * context to draft from.
 */
export async function parseCaptureInputs({
  audio,
  noteImages,
  roster,
}: ParseInputs): Promise<ParseOutputs> {
  const [audioRes, ...notesRes] = await Promise.all([
    audio ? transcribeAudio(audio) : Promise.resolve({ text: "" }),
    ...noteImages.map((img) => ocrImage(img)),
  ]);

  const rawTranscripts = audioRes.text ? [audioRes.text] : [];
  const rawNotes = notesRes.map((r) => r.text).filter((t) => t.trim().length > 0);

  // Tokenize each blob against the roster individually so we can keep the
  // [STUDENT_n] indices contiguous across all sources.
  const merged: TokenMapEntry[] = [];
  const transcripts = rawTranscripts.map((t) => {
    const r = fuzzyMatchRoster(t, roster);
    merged.push(...r.tokenMap);
    return r.tokenizedText;
  });
  const notes = rawNotes.map((n) => {
    const r = fuzzyMatchRoster(n, roster);
    merged.push(...r.tokenMap);
    return r.tokenizedText;
  });

  // De-dupe tokens by studentId — keep the first occurrence's token id.
  const seen = new Set<string>();
  const tokenMap = merged.filter((entry) => {
    if (seen.has(entry.studentId)) return false;
    seen.add(entry.studentId);
    return true;
  });

  return { transcripts, notes, tokenMap };
}
