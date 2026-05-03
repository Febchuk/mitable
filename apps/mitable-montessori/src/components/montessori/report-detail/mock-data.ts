/* Static seed for the placeholder chat pane. Wired up later when the editing
   assistant agent ships. The shape mirrors what the prototype renders. */

export type ChatSeedMessage =
  | { kind: "ai"; body: string }
  | { kind: "user"; body: string }
  | {
      kind: "ai-proposal";
      lead: string;
      target: string;
      oldText: string;
      newText: string;
    }
  | {
      kind: "ai-chips";
      body: string;
      chips: string[];
    }
  | {
      kind: "ai-obs-ref";
      body: string;
      obs: { when: string; area: string; quote: string };
    };

export const CHAT_SEED: ChatSeedMessage[] = [
  {
    kind: "ai",
    body: "I drafted Ada's day from 4 voice notes and 2 photos you captured. The morning paragraph is the one I'm least sure about — the audio was a bit rushed. Want to start there?",
  },
  {
    kind: "user",
    body: "Yeah — the morning feels clinical. Make it warmer, like how I'd actually tell her parents.",
  },
  {
    kind: "ai-proposal",
    lead: "Here's a warmer take. Same facts, more like how you'd say it at pickup:",
    target: "Morning paragraph",
    oldText:
      "Ada arrived at 8:42 and selected the pink tower. She completed the sequence with no errors and returned the materials properly.",
    newText:
      "Ada came in quietly this morning and headed straight for the pink tower — she's been drawn to it for two weeks now. She built it in one steady go, hands sure of where each cube belonged, and put everything back without being asked.",
  },
  {
    kind: "user",
    body: "Also — should I mention Mateo? They worked together for a bit.",
  },
  {
    kind: "ai-chips",
    body: "Good call. Two ways to handle it:",
    chips: [
      "Keep focus on Ada, mention Mateo briefly",
      "Drop Mateo — Ada's report",
      "Add a sentence about their collaboration",
    ],
  },
  {
    kind: "ai-obs-ref",
    body: 'I have a photo from 10:14 you didn\'t reference yet — Ada tracing the sandpaper letter "S" with Mateo watching. Want to pull it into the report?',
    obs: {
      when: "10:14 AM",
      area: "Language area",
      quote: '"Ada traced S three times slowly. Mateo asked if he could try."',
    },
  },
];
