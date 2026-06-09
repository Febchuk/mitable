import type { ChatSectionRole } from "@/lib/anthropic/report-chat-tools";
import type { SectionMeta } from "@/lib/report-templates/sections";

export function isTopicCommentsHeading(heading: string): boolean {
  return heading.endsWith(" — Comments");
}

/** Reports created from the pinned classroom default template (no template_id). */
export function isDefaultClassroomReport(
  templateId: string | null | undefined,
  sectionMeta: SectionMeta
): boolean {
  if (templateId) return false;
  return Object.values(sectionMeta).some((entry) => entry?.type === "progress_topic");
}

export function defaultClassroomSectionRole(
  heading: string,
  sectionMeta: SectionMeta
): ChatSectionRole {
  if (isTopicCommentsHeading(heading)) return "topic_comments";
  if (sectionMeta[heading]?.type === "progress_topic") return "progress_grid";
  return "text";
}
