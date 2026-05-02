"use client";

import { Book } from "lucide-react";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";

export default function CurriculumPage() {
  return (
    <div>
      <PageHeader overline="Album & materials" title="Curriculum" />
      <div style={{ padding: "14px 24px 60px" }}>
        <div style={{ ...cardStyle, padding: 28, textAlign: "center" }}>
          <Book size={28} strokeWidth={1.5} />
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              marginTop: 10,
              color: "var(--color-ink)",
            }}
          >
            Curriculum library
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--color-ink-secondary)",
              marginTop: 4,
            }}
          >
            Album, lesson plans, and material guides — coming next.
          </div>
        </div>
      </div>
    </div>
  );
}
