import { PageHeader } from "@/components/montessori/page-header";

export default function AdminTeachersPage() {
  return (
    <div>
      <PageHeader
        overline="Admin workspace"
        title="Teachers"
        subtitle="Invite guides and assign classrooms."
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
        Teacher accounts and classroom assignments will live here. Classrooms and children can be managed from{" "}
        <span style={{ color: "var(--color-ink)" }}>Classrooms</span>.
      </div>
    </div>
  );
}
