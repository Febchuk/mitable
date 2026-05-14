import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { fieldPayloadToReadableText } from "@/lib/reports/template-field-payload";

const INK = "#2A2723";
const INK_SECONDARY = "#4A453E";
const INK_MUTED = "#8A8275";
const BORDER = "#E2D9CA";
const ACCENT = "#82C0CC";
const CREAM = "#FAF7F0";

const s = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 64,
    paddingHorizontal: 0,
    backgroundColor: "#FFFFFF",
    fontFamily: "Helvetica",
    fontSize: 11,
    color: INK,
    lineHeight: 1.6,
  },
  topBand: {
    height: 4,
    backgroundColor: ACCENT,
  },
  headerWrap: {
    backgroundColor: CREAM,
    paddingHorizontal: 52,
    paddingTop: 32,
    paddingBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  studentName: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: INK,
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  reportMeta: {
    fontSize: 10,
    color: INK_MUTED,
    marginTop: 6,
    lineHeight: 1.5,
  },
  body: {
    paddingHorizontal: 52,
    paddingTop: 28,
  },
  sectionHeading: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: INK,
    marginTop: 22,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  firstSectionHeading: {
    marginTop: 0,
  },
  paragraph: {
    fontSize: 10.5,
    color: INK_SECONDARY,
    marginBottom: 10,
    lineHeight: 1.7,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 52,
    right: 52,
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 7.5,
    color: INK_MUTED,
    letterSpacing: 0.3,
  },
});

export interface ReportPdfData {
  title: string;
  studentName: string;
  reportDate: string | null;
  classroom: string;
  reportType: string;
  sections: { heading: string; paragraphs: { html: string }[] }[];
  body: string | null;
}

function formatDate(raw: string): string {
  try {
    const d = new Date(raw);
    return d.toLocaleDateString("en-US", {
      weekday: "long",
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

export function ReportDocument({ data }: { data: ReportPdfData }) {
  const hasSections =
    data.sections.length > 0 &&
    data.sections.some((sec) =>
      sec.paragraphs.some((p) => fieldPayloadToReadableText(p.html).length > 0)
    );

  const dateDisplay = data.reportDate ? formatDate(data.reportDate) : null;
  const metaParts = [
    `${capitalizeType(data.reportType)} Report`,
    dateDisplay,
    data.classroom || null,
  ].filter(Boolean);

  return (
    <Document title={`${data.studentName} — Report`} author="Mitable">
      <Page size="LETTER" style={s.page}>
        <View style={s.topBand} fixed />

        <View style={s.headerWrap}>
          <Text style={s.studentName}>{data.studentName}</Text>
          <Text style={s.reportMeta}>{metaParts.join("  ·  ")}</Text>
        </View>

        <View style={s.body}>
          {hasSections
            ? data.sections.map((section, si) => (
                <View key={si}>
                  {section.heading && (
                    <Text
                      style={
                        si === 0 ? [s.sectionHeading, s.firstSectionHeading] : s.sectionHeading
                      }
                    >
                      {section.heading}
                    </Text>
                  )}
                  {section.paragraphs.map((p, pi) => {
                    const text = fieldPayloadToReadableText(p.html);
                    if (!text) return null;
                    return (
                      <Text key={pi} style={s.paragraph}>
                        {text}
                      </Text>
                    );
                  })}
                </View>
              ))
            : data.body && (
                <View>
                  {data.body.split(/\n{2,}/).map((block, i) => {
                    const text = block.replace(/<[^>]+>/g, "").trim();
                    if (!text) return null;
                    if (text.startsWith("# ")) {
                      return (
                        <Text
                          key={i}
                          style={
                            i === 0 ? [s.sectionHeading, s.firstSectionHeading] : s.sectionHeading
                          }
                        >
                          {text.slice(2)}
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
              )}
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>MITABLE</Text>
          <Text style={s.footerText}>Confidential — for family use only</Text>
        </View>
      </Page>
    </Document>
  );
}
