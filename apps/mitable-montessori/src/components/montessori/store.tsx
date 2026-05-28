"use client";

import * as React from "react";
import { Send, X } from "lucide-react";
import {
  CHILDREN,
  INITIAL_ATTENDANCE,
  INITIAL_CHAT,
  INITIAL_REPORTS,
  SCRIPTED_REPLIES,
  findChild,
  markToStatus,
  type AttendanceMark,
  type CellNote,
  type ChatMessage,
  type ObservationMessage,
  type ProgressMark,
  type RecentUpdateEntry,
  type Report,
} from "./data";
import type { ClassroomProgress } from "@/lib/queries/classroom-progress";
import { HandCheck, ToastBus } from "./primitives";

export type WebRoute = "today" | "roster" | "progress" | "attendance" | "reports" | "curriculum";

export type ChatMode = "open" | "pill";

/** Id-keyed progress map: progressByTopic[topicId][studentId][subtopicId] = ProgressMark.
 *  Replaces the legacy positional shape so subtopic insertion/reorder doesn't
 *  silently misalign cells. */
export type ProgressByTopic = Record<string, Record<string, Record<string, ProgressMark>>>;

export type MontessoriStore = {
  // navigation per surface
  webRoute: WebRoute;
  setWebRoute: (r: WebRoute) => void;
  webChatMode: ChatMode;
  setWebChatMode: (m: ChatMode) => void;

  // data
  chat: ChatMessage[];
  reports: Report[];
  /** Real classroom curriculum + roster + progress, hydrated server-side.
   *  Null when the page that owns the provider didn't pass an initial payload
   *  (mock-only surfaces) or when there's no active classroom. */
  classroomProgress: ClassroomProgress | null;
  /** When false, hide Speech progress (no speech program on assigned classrooms). */
  showSpeechProgressTab: boolean;
  progressByTopic: ProgressByTopic;
  notesByTopic: Record<string, Record<string, CellNote[]>>;
  recentUpdates: RecentUpdateEntry[];
  attendance: Record<string, AttendanceMark[]>;
  reportsFilter: string;
  setReportsFilter: (s: string) => void;
  rosterFilter: string;
  setRosterFilter: (s: string) => void;
  selectedChild: string | null;
  setSelectedChild: (id: string | null) => void;

  // PWA niceties
  online: boolean;
  setOnline: (v: boolean | ((prev: boolean) => boolean)) => void;
  installVisible: boolean;
  setInstallVisible: (v: boolean) => void;

  // counts
  pendingObs: number;

  // mutations
  approveObservation: (id: string) => void;
  setAsideObservation: (id: string) => void;
  editObservation: (id: string, body: string) => void;
  addUserMessage: (text: string) => string;
  addVoiceMessage: (transcript: string, duration?: string) => string;
  addAssistantText: (text: string) => string;
  addObservations: (cards: Array<Omit<ObservationMessage, "id" | "type" | "status">>) => string[];
  approveReport: (id: string) => void;
  /** Create a new in-session report and return its id. Mock-only — no
     persistence. The /app/reports/[id] page reads it via findReport(id)
     once the store has it. */
  createReport: (input: {
    childId: string;
    kind: Report["kind"];
    detail?: Report["detail"];
  }) => string;
  toggleAttendance: (childId: string, dayIndex: number) => void;
  /** Persist a bulk progress edit. Optimistically updates `progressByTopic`
   *  and `classroomProgress.progress`, then POSTs one `command` row per cell
   *  to /api/v1/student-progress/bulk. The server-side trigger projects each
   *  command into student_progress + student_progress_history atomically. */
  applyBulkProgress: (args: {
    topicId: string;
    topicName: string;
    cells: Array<{ studentId: string; subtopicId: string; subtopicName: string }>;
    status: ProgressMark;
    note?: string;
  }) => Promise<void>;

  clearAll: () => void;
};

const StoreContext = React.createContext<MontessoriStore | null>(null);

export function useMontessori(): MontessoriStore {
  const ctx = React.useContext(StoreContext);
  if (!ctx) throw new Error("useMontessori must be used inside MontessoriProvider");
  return ctx;
}

/** Build the initial id-keyed progressByTopic from the server payload.
 *  Initializes every (topic, student, subtopic) cell — missing rows default
 *  to "-" so the matrix can render without per-cell undefined checks. */
function progressFromClassroom(initial: ClassroomProgress): ProgressByTopic {
  const out: ProgressByTopic = {};
  // Seed the structure so even unwritten cells show as "-".
  const subsByTopic = new Map<string, string[]>();
  for (const st of initial.subtopics) {
    const arr = subsByTopic.get(st.topicId) ?? [];
    arr.push(st.id);
    subsByTopic.set(st.topicId, arr);
  }
  for (const t of initial.topics) {
    const subs = subsByTopic.get(t.id) ?? [];
    const studentMap: Record<string, Record<string, ProgressMark>> = {};
    for (const s of initial.students) {
      const cells: Record<string, ProgressMark> = {};
      for (const subId of subs) cells[subId] = "-";
      studentMap[s.id] = cells;
    }
    out[t.id] = studentMap;
  }
  // Overlay actual student_progress rows.
  for (const [studentId, byStudent] of Object.entries(initial.progress)) {
    for (const [subtopicId, status] of Object.entries(byStudent)) {
      const subtopic = initial.subtopics.find((s) => s.id === subtopicId);
      if (!subtopic) continue;
      const topic = out[subtopic.topicId];
      if (!topic) continue;
      const studentRow = topic[studentId];
      if (!studentRow) continue;
      studentRow[subtopicId] =
        status === "mastered"
          ? "m"
          : status === "practicing"
            ? "p"
            : status === "introduced"
              ? "i"
              : "-";
    }
  }
  return out;
}

export function MontessoriProvider({
  children,
  initialClassroomProgress = null,
  showSpeechProgressTab = false,
}: {
  children: React.ReactNode;
  initialClassroomProgress?: ClassroomProgress | null;
  showSpeechProgressTab?: boolean;
}) {
  const [webRoute, setWebRouteState] = React.useState<WebRoute>("today");
  const [webChatMode, setWebChatMode] = React.useState<ChatMode>("pill");
  const [chat, setChat] = React.useState<ChatMessage[]>(INITIAL_CHAT);
  const [reports, setReports] = React.useState<Report[]>(INITIAL_REPORTS);
  const [classroomProgress, setClassroomProgress] = React.useState<ClassroomProgress | null>(
    initialClassroomProgress
  );
  const [progressByTopic, setProgressByTopic] = React.useState<ProgressByTopic>(() =>
    initialClassroomProgress ? progressFromClassroom(initialClassroomProgress) : {}
  );
  const [notesByTopic, setNotesByTopic] = React.useState<
    Record<string, Record<string, CellNote[]>>
  >({});
  const [recentUpdates, setRecentUpdates] = React.useState<RecentUpdateEntry[]>(
    () => initialClassroomProgress?.recentUpdates ?? []
  );
  const [attendance, setAttendance] = React.useState(INITIAL_ATTENDANCE);

  const [reportsFilter, setReportsFilter] = React.useState("All");
  const [rosterFilter, setRosterFilter] = React.useState("All");
  const [selectedChild, setSelectedChild] = React.useState<string | null>(null);

  const [online, setOnlineState] = React.useState(true);
  const [installVisible, setInstallVisibleState] = React.useState(true);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem("mitable.installDismissed") === "1") {
      setInstallVisibleState(false);
    }
  }, []);

  const setInstallVisible = React.useCallback((v: boolean) => {
    setInstallVisibleState(v);
    if (!v && typeof window !== "undefined") {
      window.localStorage.setItem("mitable.installDismissed", "1");
    }
  }, []);

  const setOnline = React.useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setOnlineState((prev) => (typeof v === "function" ? v(prev) : v));
  }, []);

  const pendingObs = chat.filter((m) => m.type === "observation" && m.status === "pending").length;

  const approveObservation = React.useCallback(
    (id: string) => {
      const obs = chat.find(
        (m): m is ObservationMessage => m.type === "observation" && m.id === id
      );
      setChat((prev) =>
        prev.map((m) =>
          m.id === id && m.type === "observation" ? { ...m, status: "approved" } : m
        )
      );
      // The chat-agent observation-approval flow used to also write a
      // positional mock cell into Sensorial; that mutation has been retired
      // along with the positional progressByTopic shape. The toast still
      // fires; real progress now flows through applyBulkProgress on the
      // Progress tab (which writes via /api/v1/student-progress/bulk).
      if (obs) {
        const ch = findChild(obs.childId);
        ToastBus.push({
          message: `Approved · synced to ${ch ? ch.name.split(" ")[0] : "child"}'s record`,
          icon: <HandCheck color="var(--color-surface)" size={14} />,
        });
      }
    },
    [chat]
  );

  const applyBulkProgress = React.useCallback(
    async ({
      topicId,
      topicName,
      cells,
      status,
      note,
    }: {
      topicId: string;
      topicName: string;
      cells: Array<{ studentId: string; subtopicId: string; subtopicName: string }>;
      status: ProgressMark;
      note?: string;
    }) => {
      if (cells.length === 0) return;
      const trimmedNote = note?.trim() || "";
      const when = "just now";

      // Snapshot for rollback.
      const prevProgressByTopic = progressByTopic;
      const prevClassroomProgress = classroomProgress;
      const prevNotes = notesByTopic;
      const prevRecent = recentUpdates;

      // Optimistic local updates.
      setProgressByTopic((prev) => {
        const topicMap = { ...(prev[topicId] || {}) };
        for (const c of cells) {
          const studentRow = { ...(topicMap[c.studentId] || {}) };
          studentRow[c.subtopicId] = status;
          topicMap[c.studentId] = studentRow;
        }
        return { ...prev, [topicId]: topicMap };
      });

      setClassroomProgress((prev) => {
        if (!prev) return prev;
        const dbStatus = markToStatus(status);
        const next = { ...prev, progress: { ...prev.progress } };
        for (const c of cells) {
          const studentRow = { ...(next.progress[c.studentId] || {}) };
          studentRow[c.subtopicId] = dbStatus;
          next.progress[c.studentId] = studentRow;
        }
        return next;
      });

      if (trimmedNote) {
        setNotesByTopic((prev) => {
          const topicNotes = { ...(prev[topicId] || {}) };
          for (const c of cells) {
            const k = `${c.studentId}:${c.subtopicId}`;
            topicNotes[k] = [{ noteText: trimmedNote, when, status }, ...(topicNotes[k] || [])];
          }
          return { ...prev, [topicId]: topicNotes };
        });
      }

      const newEntries: RecentUpdateEntry[] = cells.map((c) => ({
        id: Math.random().toString(36).slice(2),
        topic: topicName,
        subtopicName: c.subtopicName,
        childId: c.studentId,
        subtopicId: c.subtopicId,
        status,
        noteText: trimmedNote || null,
        when,
      }));
      setRecentUpdates((prev) => [...newEntries, ...prev].slice(0, 60));

      // Persist via the canonical commands path. The trigger writes both
      // student_progress (upsert) and student_progress_history atomically.
      try {
        const res = await fetch("/api/v1/student-progress/bulk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            updates: cells.map((c) => ({
              studentId: c.studentId,
              subtopicId: c.subtopicId,
              status: markToStatus(status),
              comment: trimmedNote || undefined,
            })),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        // Roll back on any failure.
        setProgressByTopic(prevProgressByTopic);
        setClassroomProgress(prevClassroomProgress);
        setNotesByTopic(prevNotes);
        setRecentUpdates(prevRecent);
        ToastBus.push({ message: "Couldn't save — try again" });
      }
    },
    [progressByTopic, classroomProgress, notesByTopic, recentUpdates]
  );

  const setAsideObservation = React.useCallback((id: string) => {
    setChat((prev) => prev.filter((m) => m.id !== id));
    ToastBus.push({
      message: "Set aside · won't be saved",
      icon: <X size={12} strokeWidth={1.5} color="var(--color-surface)" />,
    });
  }, []);

  const editObservation = React.useCallback((id: string, body: string) => {
    setChat((prev) =>
      prev.map((m) => (m.id === id && m.type === "observation" ? { ...m, body, edited: true } : m))
    );
  }, []);

  const addUserMessage = React.useCallback((text: string) => {
    const id = "u" + Date.now();
    setChat((prev) => [...prev, { id, type: "user", text }]);
    return id;
  }, []);

  const addVoiceMessage = React.useCallback((transcript: string, duration = "0:14") => {
    const id = "v" + Date.now();
    setChat((prev) => [...prev, { id, type: "voice", duration, transcript }]);
    return id;
  }, []);

  const addAssistantText = React.useCallback((text: string) => {
    const id = "a" + Date.now();
    setChat((prev) => [...prev, { id, type: "assistant", text }]);
    return id;
  }, []);

  const addObservations = React.useCallback(
    (cards: Array<Omit<ObservationMessage, "id" | "type" | "status">>) => {
      const ids: string[] = [];
      setChat((prev) => {
        const next = [...prev];
        cards.forEach((c, i) => {
          const id = "o" + Date.now() + "_" + i;
          ids.push(id);
          next.push({
            id,
            type: "observation",
            status: "pending",
            ...c,
          });
        });
        return next;
      });
      return ids;
    },
    []
  );

  const clearAll = React.useCallback(() => {
    setChat(INITIAL_CHAT);
    setReports(INITIAL_REPORTS);
    setProgressByTopic(
      initialClassroomProgress ? progressFromClassroom(initialClassroomProgress) : {}
    );
    setClassroomProgress(initialClassroomProgress);
    setNotesByTopic({});
    setRecentUpdates([]);
    setAttendance(INITIAL_ATTENDANCE);
  }, [initialClassroomProgress]);

  const approveReport = React.useCallback(
    (id: string) => {
      const r = reports.find((x) => x.id === id);
      setReports((prev) => prev.map((x) => (x.id === id ? { ...x, status: "sent" } : x)));
      if (r) {
        const ch = findChild(r.childId);
        ToastBus.push({
          message: `Sent to ${ch ? ch.name : "family"}`,
          icon: <Send size={12} strokeWidth={1.5} />,
        });
      }
    },
    [reports]
  );

  const createReport = React.useCallback(
    (input: { childId: string; kind: Report["kind"]; detail?: Report["detail"] }) => {
      const id = "r-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const today = new Date();
      const when = today.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      setReports((prev) => [
        {
          id,
          childId: input.childId,
          kind: input.kind,
          when,
          period: "today",
          status: "draft",
          detail: input.detail,
        },
        ...prev,
      ]);
      return id;
    },
    []
  );

  const toggleAttendance = React.useCallback((childId: string, dayIndex: number) => {
    setAttendance((prev) => {
      const cur = prev[childId][dayIndex];
      const next: AttendanceMark = cur === "t" ? "p" : cur === "p" ? "a" : cur === "a" ? "-" : "t";
      const arr = [...prev[childId]];
      arr[dayIndex] = next;
      return { ...prev, [childId]: arr };
    });
  }, []);

  const setWebRoute = React.useCallback((r: WebRoute) => setWebRouteState(r), []);

  const value: MontessoriStore = {
    webRoute,
    setWebRoute,
    webChatMode,
    setWebChatMode,
    chat,
    reports,
    classroomProgress,
    showSpeechProgressTab,
    progressByTopic,
    notesByTopic,
    recentUpdates,
    attendance,
    reportsFilter,
    setReportsFilter,
    rosterFilter,
    setRosterFilter,
    selectedChild,
    setSelectedChild,
    online,
    setOnline,
    installVisible,
    setInstallVisible,
    pendingObs,
    approveObservation,
    setAsideObservation,
    editObservation,
    addUserMessage,
    addVoiceMessage,
    addAssistantText,
    addObservations,
    approveReport,
    createReport,
    toggleAttendance,
    applyBulkProgress,
    clearAll,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/* ------------------------------------------------------------------ */
/*  Chat composer hook — voice + text                                  */
/* ------------------------------------------------------------------ */

const VOICE_TRANSCRIPTS = [
  '"Diego just sequenced 11 to 19 on the teen board on his own. First time."',
  "\"Levi asked for the sandpaper letters again — traced 'm' and 'a' carefully.\"",
  '"Iris poured a full carafe without spilling. Twice."',
];

function wait(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export function useChatComposer() {
  const store = useMontessori();
  const [recording, setRecording] = React.useState(false);
  const [recordSecs, setRecordSecs] = React.useState(0);
  const [thinking, setThinking] = React.useState(false);
  const [text, setText] = React.useState("");
  const recordTimer = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Roughly look up children mentioned by first name to attribute fallback observations
  const guessChildId = React.useCallback((input: string): string | null => {
    const lower = input.toLowerCase();
    for (const c of CHILDREN) {
      const first = c.name.split(" ")[0].toLowerCase();
      if (lower.includes(first)) return c.id;
    }
    return null;
  }, []);

  const runAssistant = React.useCallback(
    async (input: string) => {
      setThinking(true);
      const hit = SCRIPTED_REPLIES.find((r) => r.match.test(input));
      if (hit) {
        await wait(700);
        store.addAssistantText(hit.reply);
        await wait(400);
        store.addObservations(hit.cards);
        setThinking(false);
        return;
      }

      // Fallback: a calm canned reply with a generic observation card.
      // (We deliberately don't call the live /api/v1/ai/parse-command endpoint
      //  here — it returns a different shape and would need a server-side
      //  observation drafter to be useful. Scripted replies cover the demo.)
      await wait(600);
      store.addAssistantText("Heard. I'll draft an observation when we're back online.");
      const childId = guessChildId(input) ?? "ada";
      await wait(300);
      store.addObservations([
        {
          childId,
          area: "Practical life",
          subtopic: "",
          level: "Practicing",
          body: input.length > 80 ? input.slice(0, 78) + "…" : input,
          accent: "clay",
        },
      ]);
      setThinking(false);
    },
    [store, guessChildId]
  );

  const startRecording = React.useCallback(() => {
    setRecording(true);
    setRecordSecs(0);
    recordTimer.current = setInterval(() => setRecordSecs((s) => s + 1), 1000);
  }, []);

  const stopRecording = React.useCallback(async () => {
    if (recordTimer.current) clearInterval(recordTimer.current);
    setRecording(false);
    const secs = Math.max(2, recordSecs);
    const dur = `0:${String(secs).padStart(2, "0")}`;
    const t = VOICE_TRANSCRIPTS[Math.floor(Math.random() * VOICE_TRANSCRIPTS.length)];
    store.addVoiceMessage(t, dur);
    await runAssistant(t);
  }, [recordSecs, runAssistant, store]);

  const send = React.useCallback(async () => {
    const v = text.trim();
    if (!v) return;
    setText("");
    store.addUserMessage(v);
    await runAssistant(v);
  }, [runAssistant, store, text]);

  return {
    recording,
    recordSecs,
    thinking,
    text,
    setText,
    startRecording,
    stopRecording,
    send,
  };
}
