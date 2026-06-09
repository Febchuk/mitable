import { CurriculumBrowser } from "@/components/curriculum/curriculum-browser";

export default function CurriculumPage() {
  return (
    <CurriculumBrowser
      apiBase="/api/v1/curricula"
      readOnly
      pageTitle="Curriculum"
      pageSubtitle="View scope and sequence for your assigned classrooms."
    />
  );
}
