import { listReportsV2 } from "@/lib/queries/reports";
import { ProjectLettersClient } from "./project-letters-client";
export default async function ProjectLettersPage() {
  const letters = (await listReportsV2()).filter((report) => report.reportType === "project");
  return <ProjectLettersClient letters={letters} />;
}
