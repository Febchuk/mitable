import React from "react";
import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { STATUS_LABEL, type ProgressMark } from "@/lib/progress/marking-schemas";

/* ------------------------------------------------------------------ */
/*  Palette — mirrors src/styles/globals.css theme tokens. react-pdf   */
/*  can't resolve CSS `var()`, so the values are duplicated here.       */
/* ------------------------------------------------------------------ */
const INK = "#2a2723";
const INK_MUTED = "#9c9285";
const BORDER = "#e0d8c8";
const BORDER_STRONG = "#b89880";
const SURFACE = "#fffbf3";

/** ProgressMark → badge background. Matches STATUS_COLOR tokens in globals.css. */
const MARK_BG: Record<ProgressMark, string> = {
  m: "#7a9b7a", // sage — Mastered
  p: "#e8c56a", // butter — Practicing
  i: "#b89880", // clay — Introduced
  e: "#8f5b86", // scale-excellent
  g: "#4f8f72", // scale-good
  sat: "#4f91a8", // scale-satisfactory
  min: "#d27d5f", // scale-minimum
  n: "#8b7aa8", // scale-none
  "-": BORDER, // Not started
};

/* ------------------------------------------------------------------ */
/*  Data model                                                         */
/* ------------------------------------------------------------------ */

/**
 * Structured field payload attached to a paragraph that maps to a
 * checklist or single-select template field. When present, the PDF
 * renderer prints every option with a checked/unchecked control.
 */
export type ReportPdfField =
  | { kind: "checklist"; options: string[]; selected: string[] }
  | { kind: "single_select"; options: string[]; value: string | null };

export interface ReportPdfParagraph {
  /** Plain text (already stripped of HTML / structured-field prefix). */
  text: string;
  /** Set for paragraphs that back a checklist or single-select section. */
  field?: ReportPdfField;
}

/** One marked material inside a subject's progress list. */
export interface ReportPdfProgressRow {
  name: string;
  statusMark: ProgressMark;
  comment: string | null;
}

/** Materials grouped under their parent topic, mirroring the editor. */
export interface ReportPdfProgressGroup {
  topicName: string;
  rows: ReportPdfProgressRow[];
}

export interface ReportPdfExamGradeRow {
  subject: string;
  assessmentName: string;
  percentage: number;
  gradeLabel: string;
  comments: string | null;
}

/**
 * A rendered report is a list of blocks. `subject` blocks mirror the
 * Greenhouse-style progress layout in report detail (numbered heading +
 * grouped rows with status badges + an optional teacher comment). `section`
 * blocks are ordinary prose / checklist sections.
 */
export type ReportPdfBlock =
  | {
      kind: "subject";
      index: number;
      heading: string;
      groups: ReportPdfProgressGroup[];
      comment: string | null;
    }
  | {
      kind: "section";
      heading: string;
      paragraphs: ReportPdfParagraph[];
    }
  | {
      kind: "exam_grades";
      heading: string;
      rows: ReportPdfExamGradeRow[];
    };

export interface ReportPdfData {
  title: string;
  studentName: string;
  reportDate: string | null;
  classroom: string;
  /** Teacher who wrote the report — shown on the PDF as "Observed by". */
  observedBy: string | null;
  reportType: string;
  /** Public Supabase storage URL for the template logo. Optional. */
  logoUrl: string | null;
  blocks: ReportPdfBlock[];
  /** Legacy fallback: raw "# heading\n\nprose" body used only when no blocks. */
  body: string | null;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */
const s = StyleSheet.create({
  page: {
    paddingTop: 52,
    paddingBottom: 58,
    paddingHorizontal: 56,
    backgroundColor: SURFACE,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    color: INK,
    lineHeight: 1.5,
  },
  header: {
    alignItems: "center",
    marginBottom: 14,
  },
  logo: {
    maxHeight: 60,
    maxWidth: 200,
    objectFit: "contain",
  },
  title: {
    fontSize: 21,
    fontWeight: "bold",
    color: INK,
    letterSpacing: -0.3,
    marginBottom: 12,
    lineHeight: 1.25,
  },
  identity: {
    marginBottom: 22,
  },
  identityLine: {
    fontSize: 10.5,
    color: INK,
    marginBottom: 2,
    lineHeight: 1.5,
  },
  identityLabel: {
    fontWeight: "bold",
  },

  /* Subject block (Greenhouse-style) */
  subjectBlock: {
    marginBottom: 24,
  },
  subjectHeadingRow: {
    flexDirection: "row",
    alignItems: "baseline",
    borderBottomWidth: 1,
    borderBottomColor: BORDER_STRONG,
    paddingBottom: 8,
    marginBottom: 12,
  },
  subjectIndex: {
    fontSize: 9,
    fontWeight: "bold",
    color: INK_MUTED,
    letterSpacing: 0.5,
    marginRight: 8,
  },
  subjectHeading: {
    fontSize: 12.5,
    fontWeight: "bold",
    color: INK,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  topicGroup: {
    marginBottom: 11,
  },
  topicName: {
    fontSize: 11,
    fontWeight: "bold",
    color: INK,
    marginBottom: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingLeft: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#efe8da",
  },
  rowName: {
    fontSize: 10.5,
    color: INK,
    flexShrink: 1,
    paddingRight: 12,
  },
  badge: {
    flexShrink: 0,
    paddingVertical: 2.5,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
  },
  badgeText: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: INK,
  },
  emptyProgress: {
    fontSize: 10.5,
    color: INK_MUTED,
  },
  commentBox: {
    marginTop: 12,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  commentText: {
    fontSize: 10.5,
    color: INK,
    lineHeight: 1.55,
    marginBottom: 4,
  },

  /* Plain section */
  section: {
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 11.5,
    fontWeight: "bold",
    color: INK,
    marginBottom: 5,
  },
  paragraph: {
    fontSize: 10.5,
    color: INK,
    marginBottom: 7,
    lineHeight: 1.55,
  },
  examTable: { marginTop: 4, borderWidth: 1, borderColor: BORDER },
  examRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  examHeader: { backgroundColor: "#f2ebdf" },
  examCell: { padding: 6, fontSize: 8.5, color: INK },
  examSubject: { width: "20%" },
  examAssessment: { width: "24%" },
  examResult: { width: "12%" },
  examGrade: { width: "14%" },
  examComments: { width: "30%" },

  /* Checklist / single-select controls */
  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    paddingLeft: 2,
  },
  box: {
    width: 9,
    height: 9,
    borderWidth: 1,
    borderColor: BORDER_STRONG,
    borderRadius: 2,
    marginRight: 7,
  },
  boxChecked: {
    width: 9,
    height: 9,
    borderWidth: 1,
    borderColor: INK,
    backgroundColor: INK,
    borderRadius: 2,
    marginRight: 7,
  },
  radio: {
    width: 9,
    height: 9,
    borderWidth: 1,
    borderColor: BORDER_STRONG,
    borderRadius: 999,
    marginRight: 7,
  },
  radioChecked: {
    width: 9,
    height: 9,
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: SURFACE,
    borderRadius: 999,
    marginRight: 7,
  },
  choiceLabel: {
    fontSize: 10.5,
    color: INK,
    flexShrink: 1,
  },

  footer: {
    position: "absolute",
    bottom: 30,
    left: 56,
    right: 56,
    textAlign: "center",
  },
  footerText: {
    fontSize: 8.5,
    color: INK_MUTED,
    letterSpacing: 0.3,
  },
});

function formatDate(raw: string): string {
  try {
    const d = new Date(raw);
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return raw;
  }
}

function StatusBadge({ mark }: { mark: ProgressMark }) {
  return (
    <View style={[s.badge, { backgroundColor: MARK_BG[mark] ?? BORDER }]}>
      <Text style={s.badgeText}>{STATUS_LABEL[mark] ?? "—"}</Text>
    </View>
  );
}

function ChoiceRow({
  checked,
  label,
  control,
}: {
  checked: boolean;
  label: string;
  control: "check" | "radio";
}) {
  const boxStyle =
    control === "radio" ? (checked ? s.radioChecked : s.radio) : checked ? s.boxChecked : s.box;
  return (
    <View style={s.choiceRow} wrap={false}>
      <View style={boxStyle} />
      <Text style={s.choiceLabel}>{label}</Text>
    </View>
  );
}

function SubjectBlock({ block }: { block: Extract<ReportPdfBlock, { kind: "subject" }> }) {
  const hasRows = block.groups.some((g) => g.rows.length > 0);
  return (
    <View style={s.subjectBlock}>
      <View style={s.subjectHeadingRow} wrap={false}>
        <Text style={s.subjectIndex}>{String(block.index).padStart(2, "0")}</Text>
        <Text style={s.subjectHeading}>{block.heading}</Text>
      </View>

      {hasRows ? (
        block.groups.map((group, gi) => (
          <View key={gi} style={s.topicGroup}>
            <Text style={s.topicName}>{group.topicName}</Text>
            {group.rows.map((row, ri) => (
              <View key={ri} style={s.row} wrap={false}>
                <Text style={s.rowName}>{row.name}</Text>
                <StatusBadge mark={row.statusMark} />
              </View>
            ))}
          </View>
        ))
      ) : (
        <Text style={s.emptyProgress}>No materials were marked during this period.</Text>
      )}

      {block.comment && block.comment.trim() ? (
        <View style={s.commentBox}>
          {block.comment
            .trim()
            .split("\n")
            .filter((l) => l.trim().length > 0)
            .map((line, li) => (
              <Text key={li} style={s.commentText}>
                {line}
              </Text>
            ))}
        </View>
      ) : null}
    </View>
  );
}

function PlainSection({ block }: { block: Extract<ReportPdfBlock, { kind: "section" }> }) {
  return (
    <View style={s.section}>
      {block.heading ? <Text style={s.sectionHeading}>{block.heading}</Text> : null}
      {block.paragraphs.map((p, pi) => {
        if (p.field) {
          if (p.field.kind === "checklist") {
            const selected = p.field.selected;
            return (
              <View key={pi}>
                {p.field.options.map((opt) => (
                  <ChoiceRow
                    key={opt}
                    control="check"
                    checked={selected.includes(opt)}
                    label={opt}
                  />
                ))}
              </View>
            );
          }
          const value = p.field.value;
          return (
            <View key={pi}>
              {p.field.options.map((opt) => (
                <ChoiceRow key={opt} control="radio" checked={value === opt} label={opt} />
              ))}
            </View>
          );
        }
        if (!p.text) return null;
        const lines = p.text.split("\n").filter((l) => l.length > 0);
        return (
          <View key={pi}>
            {lines.map((line, li) => (
              <Text key={li} style={s.paragraph}>
                {line}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function ExamGradesBlock({ block }: { block: Extract<ReportPdfBlock, { kind: "exam_grades" }> }) {
  const columns = [
    ["Subject", s.examSubject],
    ["Exam", s.examAssessment],
    ["Result", s.examResult],
    ["Grade", s.examGrade],
    ["Comments", s.examComments],
  ] as const;
  return (
    <View style={s.section}>
      <Text style={s.sectionHeading}>{block.heading}</Text>
      {block.rows.length === 0 ? (
        <Text style={s.emptyProgress}>No exam grades were recorded for this term.</Text>
      ) : (
        <View style={s.examTable}>
          <View style={[s.examRow, s.examHeader]} wrap={false}>
            {columns.map(([label, width]) => (
              <Text key={label} style={[s.examCell, width, { fontWeight: "bold" }]}>
                {label}
              </Text>
            ))}
          </View>
          {block.rows.map((row, index) => (
            <View key={`${row.subject}-${index}`} style={s.examRow} wrap={false}>
              <Text style={[s.examCell, s.examSubject]}>{row.subject}</Text>
              <Text style={[s.examCell, s.examAssessment]}>{row.assessmentName}</Text>
              <Text style={[s.examCell, s.examResult]}>{row.percentage}%</Text>
              <Text style={[s.examCell, s.examGrade]}>{row.gradeLabel}</Text>
              <Text style={[s.examCell, s.examComments]}>{row.comments?.trim() || "—"}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function ReportDocument({ data }: { data: ReportPdfData }) {
  const hasBlocks =
    data.blocks.length > 0 &&
    data.blocks.some(
      (b) =>
        b.kind === "subject" ||
        b.kind === "exam_grades" ||
        b.paragraphs.some((p) => p.field || p.text.length > 0) ||
        b.heading.length > 0
    );

  const dateDisplay = data.reportDate ? formatDate(data.reportDate) : null;
  const observedBy = data.observedBy?.trim() || "Teacher";

  return (
    <Document title={`${data.studentName} — Report`} author="Mitable">
      <Page size="LETTER" style={s.page}>
        {data.logoUrl ? (
          <View style={s.header}>
            <Image src={data.logoUrl} style={s.logo} />
          </View>
        ) : null}

        {data.title ? <Text style={s.title}>{data.title}</Text> : null}

        <View style={s.identity}>
          <Text style={s.identityLine}>
            <Text style={s.identityLabel}>Student: </Text>
            {data.studentName}
          </Text>
          {dateDisplay ? (
            <Text style={s.identityLine}>
              <Text style={s.identityLabel}>Date: </Text>
              {dateDisplay}
            </Text>
          ) : null}
          {data.classroom ? (
            <Text style={s.identityLine}>
              <Text style={s.identityLabel}>Classroom: </Text>
              {data.classroom}
            </Text>
          ) : null}
          <Text style={s.identityLine}>
            <Text style={s.identityLabel}>Observed by: </Text>
            {observedBy}
          </Text>
        </View>

        {hasBlocks
          ? data.blocks.map((block, bi) =>
              block.kind === "subject" ? (
                <SubjectBlock key={bi} block={block} />
              ) : block.kind === "exam_grades" ? (
                <ExamGradesBlock key={bi} block={block} />
              ) : (
                <PlainSection key={bi} block={block} />
              )
            )
          : data.body
            ? data.body.split(/\n{2,}/).map((chunk, i) => {
                const text = chunk.replace(/<[^>]+>/g, "").trim();
                if (!text) return null;
                if (text.startsWith("# ")) {
                  return (
                    <Text key={i} style={s.sectionHeading}>
                      {text.slice(2)}
                    </Text>
                  );
                }
                return (
                  <Text key={i} style={s.paragraph}>
                    {text}
                  </Text>
                );
              })
            : null}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>Prepared with Mitable</Text>
        </View>
      </Page>
    </Document>
  );
}
