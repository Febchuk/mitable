"use client";

import * as React from "react";
import { Send, X } from "lucide-react";
import {
  CHILDREN,
  INITIAL_ATTENDANCE,
  INITIAL_CHAT,
  INITIAL_PROGRESS,
  INITIAL_REPORTS,
  SCRIPTED_REPLIES,
  SUBTOPICS,
  findChild,
  type AttendanceMark,
  type ChatMessage,
  type ObservationMessage,
  type ProgressMark,
  type Report,
} from "./data";
import { HandCheck, ToastBus } from "./primitives";

export type WebRoute = "today" | "roster" | "progress" | "attendance" | "reports" | "curriculum";

export type ChatMode = "open" | "pill";

export type MontessoriStore = {
  // navigation per surface
  webRoute: WebRoute;
  setWebRoute: (r: WebRoute) => void;
  webChatMode: ChatMode;
  setWebChatMode: (m: ChatMode) => void;

  // data
  chat: ChatMessage[];
  reports: Report[];
  progress: Record<string, ProgressMark[]>;
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
  toggleAttendance: (childId: string, dayIndex: number) => void;
  clearAll: () => void;
};

const StoreContext = React.createContext<MontessoriStore | null>(null);

export function useMontessori(): MontessoriStore {
  const ctx = React.useContext(StoreContext);
  if (!ctx) throw new Error("useMontessori must be used inside MontessoriProvider");
  return ctx;
}

export function MontessoriProvider({ children }: { children: React.ReactNode }) {
  const [webRoute, setWebRouteState] = React.useState<WebRoute>("today");
  const [webChatMode, setWebChatMode] = React.useState<ChatMode>("pill");
  const [chat, setChat] = React.useState<ChatMessage[]>(INITIAL_CHAT);
  const [reports, setReports] = React.useState<Report[]>(INITIAL_REPORTS);
  const [progress, setProgress] = React.useState(INITIAL_PROGRESS);
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
      if (obs) {
        const ch = findChild(obs.childId);
        ToastBus.push({
          message: `Approved · synced to ${ch ? ch.name.split(" ")[0] : "child"}'s record`,
          icon: <HandCheck color="var(--color-surface)" size={14} />,
        });
        const subIdx = SUBTOPICS.indexOf(obs.subtopic);
        if (subIdx >= 0 && progress[obs.childId]) {
          const lvl: ProgressMark | null =
            obs.level === "Mastered"
              ? "m"
              : obs.level === "Practicing"
                ? "p"
                : obs.level === "Introduced"
                  ? "i"
                  : null;
          if (lvl) {
            setProgress((prev) => ({
              ...prev,
              [obs.childId]: prev[obs.childId].map((v, i) => (i === subIdx ? lvl : v)),
            }));
          }
        }
      }
    },
    [chat, progress]
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
    setProgress(INITIAL_PROGRESS);
    setAttendance(INITIAL_ATTENDANCE);
  }, []);

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
    progress,
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
    toggleAttendance,
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
