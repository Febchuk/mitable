import { PageHeader } from "@/components/montessori/page-header";

export default function AdminReportsPage() {
  return (
    <div>
      <PageHeader
        overline="Admin workspace"
        title="Reports"
        subtitle="Review and approve reports before families receive them."
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
        Report review tools will connect here. Guides still draft and submit from the guide app; you will approve and send from this view.
      </div>
    </div>
  );
}
