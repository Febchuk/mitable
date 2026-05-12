/**
 * Phase 0/1 fixtures. Shape mirrors what Phase 2 will return from a real
 * listReports() extended with AI score + reviewer ticks + completeness.
 *
 * When Phase 2 lands, this file's `MockReport` type becomes the real
 * `ReportListRowV2` in src/lib/queries/reports.ts and these fixtures get
 * deleted or moved into a tests directory.
 */

export type V2Tab = "drafts" | "review" | "approved" | "sent";

export type V2ReportType = "DAILY" | "MAJOR" | "INCIDENT";

export type V2Tone = "clay" | "sage" | "butter" | "blue";

export type AIFlag = {
  kind: "tone" | "evidence" | "pii" | "template";
  status: "ok" | "warn" | "fail";
  note: string;
};

export type V2Reviewer = {
  initials: string;
  name: string;
  tone: V2Tone;
  ticked: boolean;
};

export type MockReport = {
  id: string;
  childName: string;
  childInitials: string;
  childTone: V2Tone;
  reportType: V2ReportType;
  title: string;
  summary: string;
  tab: V2Tab;
  aiScore: number; // 0-100
  aiFlags: AIFlag[];
  aiReasoning: string[];
  // tab-specific signals
  completenessPercent?: number; // drafts
  reviewers?: V2Reviewer[]; // review (2 of 3 etc.)
  scheduledSend?: string; // approved
  deliveryRead?: number; // sent
  deliveryTotal?: number; // sent
  hasReply?: boolean;
  // meta
  lastEditedAgo?: string;
  sentAgo?: string;
  approvedBy?: string;
  sentAt?: string;
  authorInitials: string;
  authorName: string;
  isUrgent?: boolean;
  isReadyToPromote?: boolean;
};

export const mockReports: MockReport[] = [
  // ───────────── DRAFTS ─────────────
  {
    id: "draft-ada-pink-tower",
    childName: "Ada Okafor",
    childInitials: "AD",
    childTone: "clay",
    reportType: "MAJOR",
    title: "Pink Tower mastery",
    summary:
      "Self-corrected mid-sequence; sustained 27-min cycle. Quotes attributed. Photos linked.",
    tab: "drafts",
    aiScore: 92,
    aiFlags: [
      { kind: "tone", status: "ok", note: "Descriptive, non-evaluative" },
      { kind: "evidence", status: "ok", note: "3 observable behaviors cited" },
      { kind: "pii", status: "ok", note: "No PII risk" },
      { kind: "template", status: "ok", note: "98% adherence" },
    ],
    aiReasoning: [
      "Strong evidence — 3 observable behaviors cited (independent setup, error self-correction, sustained 27-min cycle).",
      "Tone calibrated — descriptive, non-evaluative language consistent with prepared-environment voice.",
      "Quote attribution clean — direct speech preserved without paraphrase.",
      "Template adherence 98% — all four prompts answered with sufficient detail.",
    ],
    completenessPercent: 92,
    lastEditedAgo: "12 min ago",
    authorInitials: "SK",
    authorName: "Sara K.",
  },
  {
    id: "draft-kai-trinomial",
    childName: "Kai Nakamura",
    childInitials: "KN",
    childTone: "sage",
    reportType: "DAILY",
    title: "Trinomial cube — first attempt",
    summary: "Started building from the diagram. Needed 2 prompts before correcting orientation.",
    tab: "drafts",
    aiScore: 68,
    aiFlags: [
      { kind: "tone", status: "ok", note: "Calibrated" },
      { kind: "evidence", status: "warn", note: "Could use one more cited behavior" },
      { kind: "pii", status: "ok", note: "Clear" },
      { kind: "template", status: "warn", note: "Connection-to-plane section thin" },
    ],
    aiReasoning: [
      "Connection-to-plane paragraph is one sentence — usually 2-3 in similar reports.",
      "Evidence is solid but lacks a quote.",
    ],
    completenessPercent: 70,
    lastEditedAgo: "1h ago",
    authorInitials: "SK",
    authorName: "Sara K.",
  },
  {
    id: "draft-levi-sandpaper",
    childName: "Levi Schwartz",
    childInitials: "LS",
    childTone: "butter",
    reportType: "DAILY",
    title: "Sandpaper letters — m, l, s",
    summary: "Sound-symbol link emerging. Traced 'l' three times unprompted.",
    tab: "drafts",
    aiScore: 48,
    aiFlags: [
      { kind: "tone", status: "warn", note: "Slightly evaluative ('great job')" },
      { kind: "evidence", status: "warn", note: "Only one observation" },
      { kind: "pii", status: "ok", note: "Clear" },
      { kind: "template", status: "fail", note: "Quote and photo evidence missing" },
    ],
    aiReasoning: [
      "Body is 2 sentences — under usual length.",
      "No photo evidence attached.",
      "Tone language ('great job') is evaluative, prefer descriptive.",
    ],
    completenessPercent: 48,
    lastEditedAgo: "yesterday",
    authorInitials: "SK",
    authorName: "Sara K.",
  },
  {
    id: "draft-iris-goodbye",
    childName: "Iris Moreau",
    childInitials: "IM",
    childTone: "blue",
    reportType: "INCIDENT",
    title: "Tearful goodbye — recovered by 9:10a",
    summary: "Re-entered the cycle within 12 minutes. Found Bea at the pouring table.",
    tab: "drafts",
    aiScore: 85,
    aiFlags: [
      { kind: "tone", status: "ok", note: "Calibrated" },
      { kind: "evidence", status: "ok", note: "Clear timeline" },
      { kind: "pii", status: "ok", note: "Clear" },
      { kind: "template", status: "ok", note: "Complete" },
    ],
    aiReasoning: ["Timeline is precise (9:00–9:12).", "Recovery framing is descriptive."],
    completenessPercent: 85,
    lastEditedAgo: "2d ago",
    authorInitials: "SK",
    authorName: "Sara K.",
  },

  // ───────────── IN REVIEW ─────────────
  {
    id: "review-ada-pink-tower",
    childName: "Ada Okafor",
    childInitials: "AD",
    childTone: "clay",
    reportType: "MAJOR",
    title: "Pink Tower mastery",
    summary:
      "Self-corrected mid-sequence; sustained 27-min cycle. Quotes attributed. Photos linked.",
    tab: "review",
    aiScore: 92,
    aiFlags: [
      { kind: "tone", status: "ok", note: "Descriptive" },
      { kind: "evidence", status: "ok", note: "Strong" },
      { kind: "pii", status: "ok", note: "No PII risk" },
      { kind: "template", status: "ok", note: "98%" },
    ],
    aiReasoning: ["High-confidence — green-tier reports rarely change in review."],
    reviewers: [
      { initials: "MW", name: "Mei Wong", tone: "sage", ticked: true },
      { initials: "DR", name: "Diego Ruiz", tone: "clay", ticked: true },
      { initials: "JT", name: "Jamie Tao", tone: "butter", ticked: false },
    ],
    sentAgo: "4h ago",
    authorInitials: "SK",
    authorName: "Sara K.",
  },
  {
    id: "review-bea-number-rods",
    childName: "Bea Chen",
    childInitials: "BC",
    childTone: "sage",
    reportType: "DAILY",
    title: "Number rods — 1–5 named",
    summary: "Named rods independently. Linked length to numeral cards.",
    tab: "review",
    aiScore: 90,
    aiFlags: [
      { kind: "tone", status: "ok", note: "Calibrated" },
      { kind: "evidence", status: "ok", note: "Solid" },
      { kind: "pii", status: "ok", note: "Clear" },
      { kind: "template", status: "ok", note: "Complete" },
    ],
    aiReasoning: ["All reviewers ticked — ready to promote to admin sign-off."],
    reviewers: [
      { initials: "MW", name: "Mei Wong", tone: "sage", ticked: true },
      { initials: "JT", name: "Jamie Tao", tone: "butter", ticked: true },
      { initials: "RS", name: "Rita Singh", tone: "blue", ticked: true },
    ],
    sentAgo: "1d ago",
    authorInitials: "SK",
    authorName: "Sara K.",
    isReadyToPromote: true,
  },
  {
    id: "review-diego-africa",
    childName: "Diego Ramos",
    childInitials: "DR",
    childTone: "butter",
    reportType: "MAJOR",
    title: "Map of Africa — country naming",
    summary: "Identified 9 countries unaided. Asked about Madagascar 'island'.",
    tab: "review",
    aiScore: 81,
    aiFlags: [
      { kind: "tone", status: "ok", note: "Descriptive" },
      { kind: "evidence", status: "ok", note: "Specific count" },
      { kind: "pii", status: "ok", note: "Clear" },
      { kind: "template", status: "warn", note: "Connection-to-plane brief" },
    ],
    aiReasoning: ["High-but-not-green — worth a quick read before approving."],
    reviewers: [
      { initials: "MW", name: "Mei Wong", tone: "sage", ticked: true },
      { initials: "DR", name: "Diego Ruiz", tone: "clay", ticked: false },
      { initials: "JT", name: "Jamie Tao", tone: "butter", ticked: false },
    ],
    sentAgo: "6h ago",
    authorInitials: "SK",
    authorName: "Sara K.",
  },
  {
    id: "review-noor-bumped-head",
    childName: "Noor Habib",
    childInitials: "NH",
    childTone: "clay",
    reportType: "INCIDENT",
    title: "Bumped head — minimal",
    summary: "Tripped over rug edge. No mark; refused ice. Notified guardian.",
    tab: "review",
    aiScore: 88,
    aiFlags: [
      { kind: "tone", status: "ok", note: "Calibrated" },
      { kind: "evidence", status: "ok", note: "Complete timeline" },
      { kind: "pii", status: "ok", note: "Guardian name redacted" },
      { kind: "template", status: "ok", note: "Incident template followed" },
    ],
    aiReasoning: ["Incident report — guardian already notified per protocol."],
    reviewers: [
      { initials: "MW", name: "Mei Wong", tone: "sage", ticked: true },
      { initials: "DR", name: "Diego Ruiz", tone: "clay", ticked: true },
      { initials: "JT", name: "Jamie Tao", tone: "butter", ticked: false },
    ],
    sentAgo: "2h ago",
    authorInitials: "SK",
    authorName: "Sara K.",
    isUrgent: true,
  },

  // ───────────── APPROVED ─────────────
  {
    id: "approved-ada",
    childName: "Ada Okafor",
    childInitials: "AD",
    childTone: "clay",
    reportType: "MAJOR",
    title: "Pink Tower mastery",
    summary: "Approved by Mei W. · scheduled for parents Fri 4:00p.",
    tab: "approved",
    aiScore: 92,
    aiFlags: [],
    aiReasoning: [],
    scheduledSend: "Fri · 4:00p",
    approvedBy: "MW",
    authorInitials: "SK",
    authorName: "Sara K.",
  },
  {
    id: "approved-bea",
    childName: "Bea Chen",
    childInitials: "BC",
    childTone: "sage",
    reportType: "DAILY",
    title: "Number rods — 1–5 named",
    summary: "Approved by Mei W. · scheduled Fri 4:00p.",
    tab: "approved",
    aiScore: 90,
    aiFlags: [],
    aiReasoning: [],
    scheduledSend: "Fri · 4:00p",
    approvedBy: "MW",
    authorInitials: "SK",
    authorName: "Sara K.",
  },
  {
    id: "approved-kai",
    childName: "Kai Nakamura",
    childInitials: "KN",
    childTone: "sage",
    reportType: "DAILY",
    title: "Trinomial cube — first attempt",
    summary: "Approved by Jamie T. · queued for batch send.",
    tab: "approved",
    aiScore: 75,
    aiFlags: [],
    aiReasoning: [],
    scheduledSend: "Fri · 4:00p",
    approvedBy: "JT",
    authorInitials: "SK",
    authorName: "Sara K.",
  },
  {
    id: "approved-mira",
    childName: "Mira Khan",
    childInitials: "MK",
    childTone: "sage",
    reportType: "DAILY",
    title: "Teen board — 11–14",
    summary: "Approved by Mei W. · awaiting parent contact info update.",
    tab: "approved",
    aiScore: 88,
    aiFlags: [],
    aiReasoning: [],
    scheduledSend: "On hold",
    approvedBy: "MW",
    authorInitials: "SK",
    authorName: "Sara K.",
  },

  // ───────────── SENT ─────────────
  {
    id: "sent-ada",
    childName: "Ada Okafor",
    childInitials: "AD",
    childTone: "clay",
    reportType: "MAJOR",
    title: "Pink Tower mastery",
    summary: "Delivered to 2 guardians · both opened.",
    tab: "sent",
    aiScore: 92,
    aiFlags: [],
    aiReasoning: [],
    deliveryRead: 2,
    deliveryTotal: 2,
    sentAt: "Fri 4:00p",
    authorInitials: "SK",
    authorName: "Sara K.",
  },
  {
    id: "sent-bea",
    childName: "Bea Chen",
    childInitials: "BC",
    childTone: "sage",
    reportType: "DAILY",
    title: "Number rods — 1–5 named",
    summary: "Delivered to 1 guardian · opened.",
    tab: "sent",
    aiScore: 90,
    aiFlags: [],
    aiReasoning: [],
    deliveryRead: 1,
    deliveryTotal: 1,
    sentAt: "Fri 4:00p",
    authorInitials: "SK",
    authorName: "Sara K.",
  },
  {
    id: "sent-eli",
    childName: "Eli Okonkwo",
    childInitials: "EO",
    childTone: "clay",
    reportType: "DAILY",
    title: "Metal insets — circle, triangle",
    summary: "Delivered to 2 guardians · 1 unread.",
    tab: "sent",
    aiScore: 84,
    aiFlags: [],
    aiReasoning: [],
    deliveryRead: 1,
    deliveryTotal: 2,
    sentAt: "Thu 4:00p",
    authorInitials: "SK",
    authorName: "Sara K.",
  },
  {
    id: "sent-iris",
    childName: "Iris Moreau",
    childInitials: "IM",
    childTone: "blue",
    reportType: "INCIDENT",
    title: "Tearful goodbye — recovered by 9:10a",
    summary: "Delivered to 1 guardian · opened, replied.",
    tab: "sent",
    aiScore: 85,
    aiFlags: [],
    aiReasoning: [],
    deliveryRead: 1,
    deliveryTotal: 1,
    sentAt: "Wed 11:30a",
    hasReply: true,
    authorInitials: "SK",
    authorName: "Sara K.",
  },
];

export function tabCounts(reports: MockReport[]): Record<V2Tab, number> {
  return reports.reduce(
    (acc, r) => {
      acc[r.tab] = (acc[r.tab] ?? 0) + 1;
      return acc;
    },
    { drafts: 0, review: 0, approved: 0, sent: 0 } as Record<V2Tab, number>
  );
}
