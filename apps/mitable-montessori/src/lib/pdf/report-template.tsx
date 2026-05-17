import React from "react";
import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const INK = "#1F1B16";
const FOOTER_INK = "#8A8275";

const s = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 64,
    backgroundColor: "#FFFFFF",
    fontFamily: "Helvetica",
    fontSize: 11,
    color: INK,
    lineHeight: 1.55,
  },
  header: {
    alignItems: "center",
    marginBottom: 18,
  },
  logo: {
    maxHeight: 64,
    maxWidth: 200,
    objectFit: "contain",
    marginBottom: 10,
  },
  metaLine: {
    fontSize: 11,
    color: INK,
    marginBottom: 2,
  },
  metaLabel: {
    fontFamily: "Helvetica-Bold",
  },
  sectionHeading: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: INK,
    marginTop: 14,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 11,
    color: INK,
    marginBottom: 8,
  },
  choiceRow: {
    fontSize: 11,
    color: INK,
    marginBottom: 3,
  },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 64,
    right: 64,
    textAlign: "center",
  },
  footerText: {
    fontSize: 9,
    color: FOOTER_INK,
    letterSpacing: 0.3,
  },
});

/**
 * Structured field payload attached to a paragraph that maps to a
 * checklist or single-select template field. When present, the PDF
 * renderer prints every option with a ticked or empty checkbox glyph
 * (rather than only the selected lines). Plain prose paragraphs leave
 * this undefined.
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

export interface ReportPdfSection {
  heading: string;
  paragraphs: ReportPdfParagraph[];
}

export interface ReportPdfData {
  title: string;
  studentName: string;
  reportDate: string | null;
  classroom: string;
  reportType: string;
  /** Public Supabase storage URL for the template logo. Optional. */
  logoUrl: string | null;
  sections: ReportPdfSection[];
  body: string | null;
}

function formatDate(raw: string): string {
  try {
    const d = new Date(raw);
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return raw;
  }
}

function capitalizeType(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** PDF-safe checkbox glyphs. Helvetica's core encoding doesn't carry
 *  `☐ / ☑`, so we use ASCII bracketed forms to guarantee correct
 *  rendering without registering an external font. */
const BOX_CHECKED = "[x]";
const BOX_EMPTY = "[ ]";

function ChoiceRow({ checked, label }: { checked: boolean; label: string }) {
  return (
    <Text style={s.choiceRow}>
      {checked ? BOX_CHECKED : BOX_EMPTY} {label}
    </Text>
  );
}

export function ReportDocument({ data }: { data: ReportPdfData }) {
  const hasSections =
    data.sections.length > 0 &&
    data.sections.some((sec) => sec.paragraphs.some((p) => p.field || p.text.length > 0));

  const dateDisplay = data.reportDate ? formatDate(data.reportDate) : null;
  const typeLabel = `${capitalizeType(data.reportType)} Report`;

  return (
    <Document title={`${data.studentName} — Report`} author="Mitable">
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          {data.logoUrl ? <Image src={data.logoUrl} style={s.logo} /> : null}
        </View>

        <View>
          <Text style={s.metaLine}>
            <Text style={s.metaLabel}>Student: </Text>
            {data.studentName}
          </Text>
          {dateDisplay ? (
            <Text style={s.metaLine}>
              <Text style={s.metaLabel}>Date: </Text>
              {dateDisplay}
            </Text>
          ) : null}
          {data.classroom ? (
            <Text style={s.metaLine}>
              <Text style={s.metaLabel}>Classroom: </Text>
              {data.classroom}
            </Text>
          ) : null}
          <Text style={s.metaLine}>
            <Text style={s.metaLabel}>Report type: </Text>
            {typeLabel}
          </Text>
        </View>

        {hasSections ? (
          data.sections.map((section, si) => (
            <View key={si} wrap={false}>
              {section.heading ? <Text style={s.sectionHeading}>{section.heading}:</Text> : null}
              {section.paragraphs.map((p, pi) => {
                if (p.field) {
                  if (p.field.kind === "checklist") {
                    return (
                      <View key={pi}>
                        {p.field.options.map((opt) => (
                          <ChoiceRow
                            key={opt}
                            checked={
                              p.field!.kind === "checklist" && p.field!.selected.includes(opt)
                            }
                            label={opt}
                          />
                        ))}
                      </View>
                    );
                  }
                  // single_select
                  const value = p.field.value;
                  return (
                    <View key={pi}>
                      {p.field.options.map((opt) => (
                        <ChoiceRow key={opt} checked={value === opt} label={opt} />
                      ))}
                    </View>
                  );
                }
                if (!p.text) return null;
                const lines = p.text.split("\n").filter((l) => l.length > 0);
                if (lines.length <= 1) {
                  return (
                    <Text key={pi} style={s.paragraph}>
                      {p.text}
                    </Text>
                  );
                }
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
          ))
        ) : data.body ? (
          <View>
            {data.body.split(/\n{2,}/).map((block, i) => {
              const text = block.replace(/<[^>]+>/g, "").trim();
              if (!text) return null;
              if (text.startsWith("# ")) {
                return (
                  <Text key={i} style={s.sectionHeading}>
                    {text.slice(2)}:
                  </Text>
                );
              }
              return (
                <Text key={i} style={s.paragraph}>
                  {text}
                </Text>
              );
            })}
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>Prepared with Mitable</Text>
        </View>
      </Page>
    </Document>
  );
}
