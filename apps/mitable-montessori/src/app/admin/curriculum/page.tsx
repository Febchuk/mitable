import { PageHeader } from "@/components/montessori/page-header";

export default function AdminCurriculumPage() {
  return (
    <div>
      <PageHeader
        overline="Admin workspace"
        title="Curriculum"
        subtitle="Structure topics and materials for your school."
      />
      <div
        style={{
          padding: "24px",
          fontSize: 14,
          color: "var(--color-ink-secondary)",
          maxWidth: 520,
          lineHeight: 1.5,
        }}
      >
        This area will hold curriculum setup. For now, guides continue to use the curriculum tools under{" "}
        <span style={{ color: "var(--color-ink)" }}>Today</span> and <span style={{ color: "var(--color-ink)" }}>Curriculum</span> in the guide app.
      </div>
    </div>
  );
}
