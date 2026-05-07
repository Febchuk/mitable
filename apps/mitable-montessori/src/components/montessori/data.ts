export type Tone = "clay" | "sage" | "butter" | "blue" | "terracotta";
export type ProgressMark = "m" | "p" | "i" | "-";
export type AttendanceMark = "p" | "a" | "t" | "-";
export type ReportStatus = "draft" | "review" | "sent";
export type ObservationStatus = "pending" | "approved";
export type ObservationLevel = "Mastered" | "Practicing" | "Introduced" | string;
export type ObservationAccent = "butter" | "sage" | "clay";

export type Child = {
  id: string;
  name: string;
  age: string;
  enrolled: string;
  tone: Tone;
  present: boolean;
  guardian: string;
  recent: string;
};

export type ReportParagraph = {
  id: string;
  /** May contain <span class="rd-token">…</span> markup for student-name tokens. */
  html: string;
};

export type ReportSection = {
  id: string;
  heading: string;
  paragraphs: ReportParagraph[];
  /** Visual-only suggested-addition card. Wired up later when the chat agent ships. */
  ghostEdit?: { id: string; html: string; sourceLabel: string };
};

export type ReportSources = {
  voiceNotes: number;
  photos: number;
  worksheets: number;
};

export type ReportDetail = {
  title: string;
  observer: string;
  classroom: string;
  /** Friendly label like "Friday, May 2". */
  dayLabel: string;
  /** Friendly label like "Saved 3 min ago". */
  savedMeta: string;
  sources: ReportSources;
  visibleTo: string[];
  sections: ReportSection[];
};

export type Report = {
  id: string;
  childId: string;
  kind: "Daily" | "Major" | "Incident";
  when: string;
  period: string;
  status: ReportStatus;
  /** Rich content for the editor view. Optional so list-only reports keep working. */
  detail?: ReportDetail;
};

export type DividerMessage = { id: string; type: "divider"; label: string };
export type AssistantMessage = { id: string; type: "assistant"; text: string };
export type UserMessage = { id: string; type: "user"; text: string };
export type VoiceMessage = {
  id: string;
  type: "voice";
  duration: string;
  transcript?: string;
};
export type ObservationMessage = {
  id: string;
  type: "observation";
  status: ObservationStatus;
  childId: string;
  area: string;
  subtopic: string;
  level: ObservationLevel;
  body: string;
  accent: ObservationAccent;
  edited?: boolean;
};

export type ChatMessage =
  | DividerMessage
  | AssistantMessage
  | UserMessage
  | VoiceMessage
  | ObservationMessage;

export const CHILDREN: Child[] = [
  {
    id: "ada",
    name: "Ada Okafor",
    age: "4y 7m",
    enrolled: "Sept 2024",
    tone: "clay",
    present: true,
    guardian: "2 guardians",
    recent: "Pink tower · 8:42a",
  },
  {
    id: "bea",
    name: "Bea Chen",
    age: "3y 11m",
    enrolled: "Sept 2024",
    tone: "sage",
    present: true,
    guardian: "1 guardian",
    recent: "Number rods · yesterday",
  },
  {
    id: "dgo",
    name: "Diego Ramos",
    age: "5y 2m",
    enrolled: "Aug 2023",
    tone: "butter",
    present: true,
    guardian: "2 guardians",
    recent: "Map of Africa · yesterday",
  },
  {
    id: "eli",
    name: "Eli Okonkwo",
    age: "4y 1m",
    enrolled: "Jan 2025",
    tone: "clay",
    present: true,
    guardian: "2 guardians",
    recent: "Metal insets · 8:20a",
  },
  {
    id: "iris",
    name: "Iris Moreau",
    age: "3y 9m",
    enrolled: "Sept 2024",
    tone: "blue",
    present: true,
    guardian: "1 guardian",
    recent: "Pouring · this morning",
  },
  {
    id: "kai",
    name: "Kai Nakamura",
    age: "4y 4m",
    enrolled: "Sept 2024",
    tone: "sage",
    present: true,
    guardian: "2 guardians",
    recent: "Trinomial cube · yesterday",
  },
  {
    id: "levi",
    name: "Levi Schwartz",
    age: "3y 6m",
    enrolled: "Mar 2026",
    tone: "butter",
    present: true,
    guardian: "1 guardian",
    recent: "Sandpaper letters · 8:30a",
  },
  {
    id: "mira",
    name: "Mira Khan",
    age: "4y 9m",
    enrolled: "Sept 2024",
    tone: "sage",
    present: true,
    guardian: "2 guardians",
    recent: "Teen board · 8:14a",
  },
  {
    id: "noor",
    name: "Noor Habib",
    age: "3y 8m",
    enrolled: "Sept 2024",
    tone: "clay",
    present: true,
    guardian: "2 guardians",
    recent: "Practical life · this week",
  },
  {
    id: "ren",
    name: "Ren Tanaka",
    age: "4y 11m",
    enrolled: "Sept 2023",
    tone: "blue",
    present: true,
    guardian: "1 guardian",
    recent: "Geometry cabinet · this week",
  },
  {
    id: "pia",
    name: "Pia Marin",
    age: "4y 0m",
    enrolled: "Sept 2024",
    tone: "butter",
    present: true,
    guardian: "2 guardians",
    recent: "Botany puzzle · yesterday",
  },
  {
    id: "tom",
    name: "Tom Walsh",
    age: "3y 7m",
    enrolled: "Sept 2024",
    tone: "clay",
    present: true,
    guardian: "1 guardian",
    recent: "Dressing frame · this morning",
  },
  {
    id: "fin",
    name: "Fin Nilsson",
    age: "4y 6m",
    enrolled: "Sept 2024",
    tone: "sage",
    present: true,
    guardian: "2 guardians",
    recent: "Knobless cylinders · yesterday",
  },
  {
    id: "val",
    name: "Val Lopez",
    age: "3y 10m",
    enrolled: "Sept 2024",
    tone: "blue",
    present: true,
    guardian: "2 guardians",
    recent: "Land/water/air · this week",
  },
  {
    id: "rui",
    name: "Rui Costa",
    age: "4y 3m",
    enrolled: "Sept 2024",
    tone: "butter",
    present: false,
    guardian: "2 guardians",
    recent: "Movable alphabet · Mon",
  },
  {
    id: "jen",
    name: "Jen Park",
    age: "4y 8m",
    enrolled: "Sept 2024",
    tone: "sage",
    present: false,
    guardian: "1 guardian",
    recent: "Stamp game · last week",
  },
  {
    id: "oli",
    name: "Oli Hassan",
    age: "5y 0m",
    enrolled: "Sept 2023",
    tone: "clay",
    present: false,
    guardian: "2 guardians",
    recent: "Continent map · last week",
  },
  {
    id: "sam",
    name: "Sam Wright",
    age: "3y 5m",
    enrolled: "Mar 2026",
    tone: "blue",
    present: false,
    guardian: "1 guardian",
    recent: "Spooning · this week",
  },
];

/** Topic name kept as a free-form string now that the Progress tab reads from
 *  the curriculum tree. The previous literal union remains as MOCK_TOPICS for
 *  surfaces that still reference the four canonical mock topics. */
export type Topic = string;

export const MOCK_TOPICS = ["Sensorial", "Practical Life", "Language", "Math"] as const;
export const TOPICS: Topic[] = [...MOCK_TOPICS];

export const SUBTOPICS_BY_TOPIC: Record<Topic, string[]> = {
  Sensorial: [
    "Pink tower",
    "Brown stair",
    "Red rods",
    "Cylinder blocks",
    "Binomial cube",
    "Trinomial cube",
    "Geometric solids",
    "Smelling jars",
    "Sound cylinders",
    "Color tablets",
    "Touch boards",
    "Thermic tablets",
  ],
  "Practical Life": [
    "Pouring water",
    "Spooning",
    "Tweezers transfer",
    "Dressing frame",
    "Folding cloths",
    "Polishing",
    "Washing hands",
    "Sweeping",
    "Table setting",
    "Flower arranging",
    "Care of plants",
  ],
  Language: [
    "Sandpaper letters",
    "Movable alphabet",
    "Object boxes",
    "Phonetic reading",
    "Puzzle words",
    "Reading folders",
    "Function of words",
    "Reading classification",
    "Story sequencing",
    "Picture stories",
  ],
  Math: [
    "Number rods",
    "Sandpaper numerals",
    "Spindle box",
    "Cards & counters",
    "Teen board",
    "Ten board",
    "Hundred board",
    "Golden bead intro",
    "Stamp game",
    "Bead chains",
    "Multiplication board",
    "Division board",
  ],
};

// Back-compat: keep SUBTOPICS as the flat sensorial list. The chat agent's
// progress side-effect in store.tsx still keys off this.
export const SUBTOPICS: string[] = SUBTOPICS_BY_TOPIC.Sensorial;

export const SUBTOPIC_INFO: Record<string, string> = {
  "Pink tower":
    "Ten graduated pink cubes, smallest 1 cm, largest 10 cm. Builds visual discrimination of size and refines hand control as the child stacks the tower from largest to smallest.",
  "Brown stair":
    "Ten rectangular prisms, varying in two dimensions. Child arranges them by thickness, refining visual judgement of width and depth.",
  "Red rods":
    "Ten red rods graduated in length from 10 cm to 1 m. Prepares the child for the Number rods in math by isolating length as a single varying quantity.",
  "Cylinder blocks":
    "Four wooden blocks of cylinders varying in diameter, height, or both. Child matches each cylinder to its socket — a built-in control of error.",
  "Binomial cube":
    "Eight blocks representing (a+b)³. A sensorial preparation for algebra; child reassembles the cube using the color-coded pattern as a guide.",
  "Trinomial cube":
    "Twenty-seven blocks representing (a+b+c)³. Extension of the binomial cube; deepens spatial reasoning and pattern recognition.",
  "Geometric solids":
    "A set of ten three-dimensional forms (sphere, cube, cone, cylinder, etc.). Child names them and finds matches in the environment.",
  "Smelling jars":
    "Pairs of identical jars containing scents (clove, mint, lavender). Child matches pairs by smell; refines olfactory discrimination.",
  "Sound cylinders":
    "Two boxes of sealed cylinders each containing a different sound. Child matches and grades by loudness; a precursor to musical training.",
  "Color tablets":
    "Boxes of paired and graded color tablets. Child matches identical pairs, then grades shades from light to dark within a single hue.",
  "Touch boards":
    "Pairs of rough and smooth surfaces. Eyes closed, child traces with two fingers and discriminates texture — preparation for sandpaper letters.",
  "Thermic tablets":
    "Pairs of metal, wood, glass, and stone tablets. Child matches pairs by warmth; refines thermic sense.",

  "Pouring water":
    "Child pours from one pitcher into another, controlling speed and stopping cleanly. The first long-loved practical-life work — develops independence and concentration.",
  Spooning:
    "Transferring dry goods (rice, beans) between bowls with a spoon. Builds the same wrist control needed later for writing.",
  "Tweezers transfer":
    "Picking up small objects (pom-poms, beads) with tweezers. Refines pincer grip and isolates the muscles used in handwriting.",
  "Dressing frame":
    "Wooden frames with cloth fastenings — buttons, snaps, zippers, ties. Child practices the motions in isolation before doing them on themselves.",
  "Folding cloths":
    "A set of cloths with stitched lines. Child folds along the lines to make precise, repeatable creases.",
  Polishing:
    "Polishing a small metal object (or a leaf, or a mirror). A multi-step sequence that demands order and care of materials.",
  "Washing hands":
    "A complete sequence: pour water, soap, scrub, rinse, dry, return materials. Often a child's first long sequential work.",
  Sweeping:
    "Child uses a child-sized broom to sweep a small marked square on the floor. Care of the environment.",
  "Table setting":
    "Setting a placemat with plate, fork, knife, spoon, glass in correct positions. A real contribution to the classroom community.",
  "Flower arranging":
    "Child arranges fresh flowers in a small vase. Encourages aesthetic sensitivity and care of life.",
  "Care of plants":
    "Watering and dusting leaves of classroom plants. A daily, real responsibility that connects the child to living things.",

  "Sandpaper letters":
    "Letters cut from sandpaper mounted on tablets. Child traces with two fingers while saying the sound — links the sound, the muscular memory, and the visual symbol.",
  "Movable alphabet":
    "A box of cut-out letters that the child arranges to spell words phonetically — long before they can write with a pencil.",
  "Object boxes":
    "Small boxes of miniature objects whose names share a phonetic feature (cat, mat, hat). Used for early sound analysis.",
  "Phonetic reading":
    "Reading short three-letter phonetic words off cards or labels. The first transition from word-building to true reading.",
  "Puzzle words":
    "Common sight words (the, was, said) introduced as 'puzzle words' — words that don't follow phonetic rules.",
  "Reading folders":
    "Sets of labeled cards organized by phonogram (sh, ch, th). Child reads through them and matches to objects or images.",
  "Function of words":
    "Symbol-based introduction to grammar — nouns are black pyramids, verbs red circles, etc. Child analyses sentences with the symbols.",
  "Reading classification":
    "Reading short paragraphs and matching them to images. The first stage of reading for meaning rather than for decoding.",
  "Story sequencing":
    "Picture cards from a familiar story arranged in order. Develops narrative thinking and oral retelling.",
  "Picture stories":
    "Child writes a short story to accompany a picture they choose. Earliest creative writing.",

  "Number rods":
    "Ten rods like the red rods, but with alternating red and blue segments — each rod is now also a unit of count. Bridges the sensorial impression of length to the abstract idea of quantity.",
  "Sandpaper numerals":
    "Numerals 0–9 cut from sandpaper. Child traces while saying the name — same multisensory technique as sandpaper letters.",
  "Spindle box":
    "Two boxes labeled 0–9. Child counts the right number of spindles into each compartment — meets zero as 'nothing' for the first time.",
  "Cards & counters":
    "Cards 1–10 paired with the corresponding number of counters laid out in pairs. Introduces odd vs even.",
  "Teen board":
    "Wooden board with a slot showing '10'; child slides a numeral 1–9 over the zero to read 11–19. First taste of place value.",
  "Ten board":
    "Pairs of boards: ten, twenty, thirty… ninety. Child reads, then composes ('twenty-three' = 23) using bead bars.",
  "Hundred board":
    "Square board with all 100 squares; child places numbered tiles 1–100 in order. Cements the linear sequence of numbers.",
  "Golden bead intro":
    "Single beads, ten-bars, hundred-squares, thousand-cubes — the decimal system made tangible. Child handles all four categories.",
  "Stamp game":
    "Color-coded stamps for units, tens, hundreds, thousands. Child performs all four operations with the stamps before paper computation.",
  "Bead chains":
    "Long chains of bead bars representing the squares and cubes of 1–10. Child counts the entire chain and labels each multiple.",
  "Multiplication board":
    "A pegboard with numbered slots. Child reads a problem (e.g. 4×6) and lays out beads in rows.",
  "Division board":
    "Similar pegboard. Child distributes beads evenly into the divisor's slots and reads the quotient.",
};

export const STATUS_LABEL: Record<ProgressMark, string> = {
  m: "Mastered",
  p: "Practicing",
  i: "Introduced",
  "-": "Not started",
};

export const STATUS_COLOR: Record<ProgressMark, string> = {
  m: "var(--color-sage)",
  p: "var(--color-butter)",
  i: "var(--color-clay)",
  "-": "var(--color-border)",
};

/** UI ↔ DB status converters. Source of truth for the DB enum lives in
 *  src/lib/queries/curriculum.ts (CurriculumStatus). */
export type CurriculumStatusValue = "introduced" | "practicing" | "mastered" | "na";

export function markToStatus(m: ProgressMark): CurriculumStatusValue {
  return m === "m" ? "mastered" : m === "p" ? "practicing" : m === "i" ? "introduced" : "na";
}

export function statusToMark(s: CurriculumStatusValue): ProgressMark {
  return s === "mastered" ? "m" : s === "practicing" ? "p" : s === "introduced" ? "i" : "-";
}

// Per-topic seeded data. Sensorial mirrors the original 12-cell sensorial seed
// for the 10 children that already had data; the other three topics use
// plausible classroom-flavored mixes generated to feel realistic.
export const INITIAL_PROGRESS_BY_TOPIC: Record<Topic, Record<string, ProgressMark[]>> = {
  Sensorial: {
    ada: ["m", "m", "p", "m", "p", "i", "-", "m", "p", "i", "-", "-"],
    bea: ["m", "p", "p", "i", "-", "-", "-", "m", "p", "i", "-", "-"],
    dgo: ["m", "m", "m", "m", "p", "p", "i", "m", "m", "p", "i", "-"],
    eli: ["p", "p", "i", "i", "-", "-", "-", "p", "i", "-", "-", "-"],
    iris: ["p", "i", "-", "-", "-", "-", "-", "i", "-", "-", "-", "-"],
    kai: ["m", "m", "p", "p", "m", "p", "i", "m", "m", "p", "p", "i"],
    levi: ["i", "-", "-", "-", "-", "-", "-", "i", "-", "-", "-", "-"],
    mira: ["m", "m", "m", "m", "p", "p", "-", "m", "m", "m", "p", "i"],
    noor: ["p", "i", "-", "-", "-", "-", "-", "p", "i", "-", "-", "-"],
    ren: ["m", "m", "p", "p", "i", "i", "-", "m", "p", "p", "i", "-"],
    pia: ["m", "p", "p", "i", "i", "-", "-", "m", "p", "i", "-", "-"],
    tom: ["i", "i", "-", "-", "-", "-", "-", "p", "-", "-", "-", "-"],
    fin: ["m", "m", "m", "p", "p", "i", "i", "m", "m", "p", "i", "-"],
    val: ["p", "p", "i", "-", "-", "-", "-", "i", "-", "-", "-", "-"],
    rui: ["m", "p", "p", "i", "i", "-", "-", "p", "p", "i", "-", "-"],
    jen: ["m", "m", "p", "i", "-", "-", "-", "m", "p", "-", "-", "-"],
    oli: ["m", "m", "m", "p", "p", "p", "i", "m", "m", "p", "p", "-"],
    sam: ["-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"],
  },
  "Practical Life": {
    ada: ["m", "m", "m", "p", "p", "p", "m", "p", "i", "-", "-"],
    bea: ["m", "m", "p", "p", "p", "i", "m", "p", "i", "-", "-"],
    dgo: ["m", "m", "m", "m", "m", "p", "m", "p", "p", "i", "i"],
    eli: ["m", "p", "p", "i", "p", "i", "p", "i", "-", "-", "-"],
    iris: ["m", "p", "i", "i", "-", "-", "p", "-", "-", "-", "-"],
    kai: ["m", "m", "p", "m", "p", "p", "m", "p", "p", "i", "-"],
    levi: ["p", "i", "-", "-", "i", "-", "p", "-", "-", "-", "-"],
    mira: ["m", "m", "m", "p", "p", "p", "m", "p", "p", "i", "i"],
    noor: ["m", "p", "i", "i", "-", "-", "p", "i", "-", "-", "-"],
    ren: ["m", "m", "p", "p", "p", "i", "m", "p", "i", "i", "-"],
    pia: ["m", "p", "p", "p", "p", "i", "p", "p", "i", "-", "-"],
    tom: ["p", "p", "i", "i", "-", "-", "p", "-", "-", "-", "-"],
    fin: ["m", "m", "m", "p", "p", "p", "m", "p", "p", "i", "-"],
    val: ["p", "p", "i", "i", "-", "-", "p", "i", "-", "-", "-"],
    rui: ["m", "p", "p", "i", "p", "i", "m", "p", "i", "-", "-"],
    jen: ["m", "m", "p", "i", "p", "-", "m", "p", "-", "-", "-"],
    oli: ["m", "m", "m", "p", "p", "p", "m", "m", "p", "i", "i"],
    sam: ["i", "-", "-", "-", "-", "-", "i", "-", "-", "-", "-"],
  },
  Language: {
    ada: ["m", "p", "p", "p", "i", "-", "-", "-", "-", "-"],
    bea: ["m", "m", "p", "p", "i", "i", "-", "-", "-", "-"],
    dgo: ["m", "m", "m", "m", "p", "p", "p", "i", "i", "-"],
    eli: ["p", "i", "i", "-", "-", "-", "-", "-", "-", "-"],
    iris: ["p", "-", "-", "-", "-", "-", "-", "-", "-", "-"],
    kai: ["m", "m", "p", "p", "p", "i", "i", "-", "-", "-"],
    levi: ["i", "-", "-", "-", "-", "-", "-", "-", "-", "-"],
    mira: ["m", "m", "m", "p", "p", "p", "i", "i", "-", "-"],
    noor: ["p", "i", "-", "-", "-", "-", "-", "-", "-", "-"],
    ren: ["m", "m", "p", "p", "i", "i", "-", "-", "-", "-"],
    pia: ["m", "p", "p", "i", "i", "-", "-", "-", "-", "-"],
    tom: ["i", "-", "-", "-", "-", "-", "-", "-", "-", "-"],
    fin: ["m", "m", "p", "p", "i", "i", "-", "-", "-", "-"],
    val: ["p", "i", "-", "-", "-", "-", "-", "-", "-", "-"],
    rui: ["m", "p", "p", "i", "i", "-", "-", "-", "-", "-"],
    jen: ["m", "p", "i", "i", "-", "-", "-", "-", "-", "-"],
    oli: ["m", "m", "m", "p", "p", "i", "i", "i", "-", "-"],
    sam: ["-", "-", "-", "-", "-", "-", "-", "-", "-", "-"],
  },
  Math: {
    ada: ["m", "m", "p", "p", "i", "-", "-", "-", "-", "-", "-", "-"],
    bea: ["m", "p", "p", "p", "i", "i", "-", "-", "-", "-", "-", "-"],
    dgo: ["m", "m", "m", "m", "p", "p", "p", "i", "i", "i", "-", "-"],
    eli: ["p", "p", "i", "i", "-", "-", "-", "-", "-", "-", "-", "-"],
    iris: ["i", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"],
    kai: ["m", "m", "p", "p", "m", "p", "i", "i", "-", "-", "-", "-"],
    levi: ["-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"],
    mira: ["m", "m", "m", "m", "p", "p", "p", "p", "i", "i", "-", "-"],
    noor: ["p", "i", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"],
    ren: ["m", "m", "p", "p", "p", "i", "i", "-", "-", "-", "-", "-"],
    pia: ["m", "p", "p", "i", "i", "-", "-", "-", "-", "-", "-", "-"],
    tom: ["i", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"],
    fin: ["m", "m", "p", "p", "p", "i", "i", "-", "-", "-", "-", "-"],
    val: ["i", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"],
    rui: ["m", "p", "p", "i", "i", "-", "-", "-", "-", "-", "-", "-"],
    jen: ["m", "p", "i", "i", "-", "-", "-", "-", "-", "-", "-", "-"],
    oli: ["m", "m", "m", "p", "p", "p", "i", "i", "i", "-", "-", "-"],
    sam: ["-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-"],
  },
};

// Sensorial-only view kept for back-compat with the chat agent's auto-progress
// side-effect; no callers other than store.tsx should depend on this.
export const INITIAL_PROGRESS: Record<string, ProgressMark[]> = INITIAL_PROGRESS_BY_TOPIC.Sensorial;

export type RecentUpdateEntry = {
  id: string;
  topic: Topic;
  subtopicName: string;
  childId: string;
  /** Stable subtopic identifier — UUID when sourced from Supabase, mock string
   *  for legacy in-memory entries. Replaced the positional `subtopicIdx`
   *  when the Progress tab moved off mock arrays. */
  subtopicId: string;
  status: ProgressMark;
  noteText: string | null;
  when: string;
};

export type CellNote = {
  noteText: string;
  when: string;
  status: ProgressMark;
};

const TOK = (name: string) =>
  `<span class="rd-token" title="Resolves to: ${name}">${name.split(" ")[0]}</span>`;

const ADA_DETAIL: ReportDetail = {
  title: "A steady Friday for Ada",
  observer: "Ms. Lena",
  classroom: "Sunflower classroom",
  dayLabel: "Friday, May 2",
  savedMeta: "Saved 3 min ago",
  sources: { voiceNotes: 4, photos: 2, worksheets: 1 },
  visibleTo: ["Ada's parents", "Lead teacher"],
  sections: [
    {
      id: "morning",
      heading: "Morning",
      paragraphs: [
        {
          id: "morning-p1",
          html: `${TOK(
            "Ada Okafor"
          )} arrived at 8:42 and selected the pink tower. She completed the sequence with no errors and returned the materials properly.`,
        },
      ],
    },
    {
      id: "language",
      heading: "Language",
      paragraphs: [
        {
          id: "language-p1",
          html: `In the language area, ${TOK(
            "Ada Okafor"
          )} worked with the sandpaper letters. She traced "S" multiple times and named two words that begin with the sound.`,
        },
      ],
      ghostEdit: {
        id: "language-ghost",
        sourceLabel: "from 10:14 photo",
        html: `${TOK(
          "Mira Khan"
        )} joined her briefly, watching her tracing pace before asking to take a turn — a small, unprompted moment of peer interest.`,
      },
    },
    {
      id: "afternoon",
      heading: "Afternoon",
      paragraphs: [
        {
          id: "afternoon-p1",
          html: `After outdoor time, ${TOK(
            "Ada Okafor"
          )} chose the metal insets. Her grip on the colored pencil was relaxed, and she stayed with the work for nearly twenty minutes — longer than any focused activity earlier this week.`,
        },
      ],
    },
    {
      id: "social",
      heading: "Social & emotional",
      paragraphs: [
        {
          id: "social-p1",
          html: `During snack, ${TOK("Ada Okafor")} noticed ${TOK(
            "Mira Khan"
          )} couldn't open her container and quietly slid hers over to use as a model. No words — just observation and care.`,
        },
      ],
    },
  ],
};

const DIEGO_DETAIL: ReportDetail = {
  title: "Diego's Friday — map work and quiet focus",
  observer: "Ms. Lena",
  classroom: "Sunflower classroom",
  dayLabel: "Friday, May 2",
  savedMeta: "Saved 12 min ago",
  sources: { voiceNotes: 2, photos: 1, worksheets: 0 },
  visibleTo: ["Diego's parents", "Lead teacher"],
  sections: [
    {
      id: "morning",
      heading: "Morning",
      paragraphs: [
        {
          id: "morning-p1",
          html: `${TOK(
            "Diego Ramos"
          )} returned to the map of Africa for a third day. He named four countries from memory before reaching for the control chart.`,
        },
      ],
    },
    {
      id: "math",
      heading: "Math",
      paragraphs: [
        {
          id: "math-p1",
          html: `${TOK(
            "Diego Ramos"
          )} worked through teen-board sequences from 11 to 19 with no prompts, then taught the layout to ${TOK(
            "Bea Chen"
          )} who joined him.`,
        },
      ],
    },
    {
      id: "social",
      heading: "Social & emotional",
      paragraphs: [
        {
          id: "social-p1",
          html: `Patient with a younger child at the practical-life shelf — waited his turn and modeled the pouring sequence rather than taking over.`,
        },
      ],
    },
  ],
};

const BEA_DETAIL: ReportDetail = {
  title: "Bea — Spring 2026 progress",
  observer: "Ms. Lena",
  classroom: "Sunflower classroom",
  dayLabel: "Spring 2026",
  savedMeta: "Saved yesterday",
  sources: { voiceNotes: 18, photos: 9, worksheets: 4 },
  visibleTo: ["Bea's parent", "Lead teacher", "Head of school"],
  sections: [
    {
      id: "overview",
      heading: "Overview",
      paragraphs: [
        {
          id: "overview-p1",
          html: `${TOK(
            "Bea Chen"
          )} has settled into Sunflower's morning rhythm. Across the spring period her concentration in math doubled compared with winter, with number rods and the teen board emerging as anchor works.`,
        },
      ],
    },
    {
      id: "math",
      heading: "Math",
      paragraphs: [
        {
          id: "math-p1",
          html: `Number rods → sequenced 1 through 10 unprompted by mid-March. Teen board → presented in April; she now narrates the operation aloud while she works.`,
        },
      ],
    },
    {
      id: "language",
      heading: "Language",
      paragraphs: [
        {
          id: "language-p1",
          html: `Sandpaper letters fluent for vowels and most consonants. Begun pairing them with the small movable alphabet — first three-letter words appeared in late April.`,
        },
      ],
    },
    {
      id: "social",
      heading: "Social & emotional",
      paragraphs: [
        {
          id: "social-p1",
          html: `Most-asked-for collaborator at the practical-life shelf this term. ${TOK(
            "Bea Chen"
          )} consistently hands off materials gently and waits for verbal confirmation before joining a peer's work.`,
        },
      ],
    },
  ],
};

/** Mock reports were retired when the reports list moved to real Supabase
   data. Kept as an empty seed so the in-memory store and the bottom-nav
   draft-count badge keep type-checking; bottom-nav still reads from the
   store but the count will always be 0 here. The real list lives at
   /app/reports backed by listReports() in src/lib/queries/reports.ts. */
export const INITIAL_REPORTS: Report[] = [];

// Sample detail blocks retained for tests that exercise the editor pane
// directly with mock data.
void ADA_DETAIL;
void DIEGO_DETAIL;
void BEA_DETAIL;

export const INITIAL_CHAT: ChatMessage[] = [
  { id: "d1", type: "divider", label: "This morning · 8:42" },
  { id: "a1", type: "assistant", text: "You captured one observation earlier." },
  {
    id: "o1",
    type: "observation",
    status: "approved",
    childId: "mira",
    area: "Math",
    subtopic: "Teen board",
    level: "Mastered",
    body: "Math → Teen board · independently completed 11 to 19.",
    accent: "sage",
  },
  {
    id: "v1",
    type: "voice",
    duration: "0:18",
    transcript:
      '"Ada chose the pink tower for the third time this week. Built it correctly — first try."',
  },
  {
    id: "a2",
    type: "assistant",
    text: "Two things to record from that. Both stay here until you approve.",
  },
  {
    id: "o2",
    type: "observation",
    status: "pending",
    childId: "ada",
    area: "Sensorial",
    subtopic: "Pink tower",
    level: "Practicing",
    body: "Sensorial → Pink tower · third return this week, built correctly on first try.",
    accent: "butter",
  },
  {
    id: "o3",
    type: "observation",
    status: "pending",
    childId: "ada",
    area: "Private note",
    subtopic: "",
    level: "not shared with family",
    body: "Drawn to the pink tower repeatedly — worth surfacing in next family conference.",
    accent: "clay",
  },
];

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export const INITIAL_ATTENDANCE: Record<string, AttendanceMark[]> = {
  ada: ["p", "p", "p", "p", "t"],
  bea: ["p", "a", "p", "p", "t"],
  dgo: ["p", "p", "p", "p", "t"],
  eli: ["p", "p", "a", "p", "t"],
  iris: ["a", "p", "p", "p", "t"],
  kai: ["p", "p", "p", "p", "t"],
  levi: ["p", "p", "p", "p", "t"],
  mira: ["p", "p", "p", "p", "t"],
  noor: ["p", "p", "p", "a", "-"],
  ren: ["p", "p", "p", "p", "t"],
};

export type ScriptedReply = {
  match: RegExp;
  reply: string;
  cards: Array<Omit<ObservationMessage, "id" | "type" | "status">>;
};

export const SCRIPTED_REPLIES: ScriptedReply[] = [
  {
    match: /pink tower|tower/i,
    reply: "Got it — adding to Ada's record.",
    cards: [
      {
        childId: "ada",
        area: "Sensorial",
        subtopic: "Pink tower",
        level: "Practicing",
        body: "Sensorial → Pink tower · returned today, built without error.",
        accent: "butter",
      },
    ],
  },
  {
    match: /(read|letter|sandpaper)/i,
    reply: "Heard. One observation drafted for Levi.",
    cards: [
      {
        childId: "levi",
        area: "Language",
        subtopic: "Sandpaper letters",
        level: "Introduced",
        body: "Language → Sandpaper letters · first presentation. Strong tactile interest.",
        accent: "butter",
      },
    ],
  },
  {
    match: /(addition|math|number|teen)/i,
    reply: "Noted — that's a Math · Practicing for Diego.",
    cards: [
      {
        childId: "dgo",
        area: "Math",
        subtopic: "Teen board",
        level: "Practicing",
        body: "Math → Teen board · sequenced 11 through 16 unprompted.",
        accent: "butter",
      },
    ],
  },
];

export function findChild(id: string): Child | undefined {
  return CHILDREN.find((c) => c.id === id);
}

export function findReport(id: string): Report | undefined {
  return INITIAL_REPORTS.find((r) => r.id === id);
}

export function initialsFor(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("");
}
