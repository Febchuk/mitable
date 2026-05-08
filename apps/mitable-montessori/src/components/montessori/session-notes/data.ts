// Session notes mode — types + a small seed.
//
// Shape mirrors what the existing /api/v1/reports endpoint persists for the
// generic "report" template, so promoting these to server-side later is a
// matter of POSTing them with templateId='session_note'. Until that wires
// up the data lives only in the in-memory store.

export type SessionNoteDraft = {
  /** ISO date (YYYY-MM-DD) the session was held. Defaults to today on new. */
  sessionDate: string;
  /** Free-text label — "Speech 1:1", "OT push-in", etc. */
  sessionType: string;
  attended: boolean;
  /** What was observed in the session. */
  observations: string;
  /** Goals worked on during the session. */
  goalsWorkedOn: string;
  /** What's next session's plan. */
  planForNext: string;
  /** Note that gets sent to the parent. */
  parentNote: string;
};

export type SessionNote = SessionNoteDraft & {
  id: string;
  studentId: string;
  /** ISO timestamp the note was created. */
  createdAt: string;
  updatedAt?: string;
};

/** Map: studentId → notes (newest first). */
export type SessionNotesByStudent = Record<string, SessionNote[]>;

export function emptySessionNoteDraft(): SessionNoteDraft {
  const today = new Date().toISOString().slice(0, 10);
  return {
    sessionDate: today,
    sessionType: "Speech 1:1",
    attended: true,
    observations: "",
    goalsWorkedOn: "",
    planForNext: "",
    parentNote: "",
  };
}

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const sessionDateAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function buildSeed(): SessionNotesByStudent {
  return {
    ada: [
      {
        id: "sn-seed-1",
        studentId: "ada",
        sessionDate: sessionDateAgo(1),
        sessionType: "Speech 1:1",
        attended: true,
        observations:
          "Ada used 3-word requests across snack and free play. Initiated greeting with two peers without prompting.",
        goalsWorkedOn: "Requesting (3+ word phrases), initiating peer greetings.",
        planForNext: "Introduce 'and' connector; aim for 4-word requests.",
        parentNote:
          "Beautiful day for Ada — she greeted Diego and Mira on her own and asked for 'more apple juice please'.",
        createdAt: daysAgo(1),
      },
    ],
    levi: [
      {
        id: "sn-seed-2",
        studentId: "levi",
        sessionDate: sessionDateAgo(3),
        sessionType: "Speech 1:1",
        attended: true,
        observations:
          "Smiled when peer waved — one second of mutual gaze. Tolerated turn-taking with toy car for 4 trades.",
        goalsWorkedOn: "Joint attention, peer turn-taking.",
        planForNext: "Add a third peer to the rotation; extend turn-taking to 6 trades.",
        parentNote: "",
        createdAt: daysAgo(3),
      },
    ],
  };
}

export const INITIAL_SESSION_NOTES: SessionNotesByStudent = buildSeed();
