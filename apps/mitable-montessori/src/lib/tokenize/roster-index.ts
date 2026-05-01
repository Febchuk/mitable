"use client";

import Fuse from "fuse.js";
import { decryptRoster } from "@/lib/db/encrypted-fields";
import { getDb } from "@/lib/db/schema";

export interface StudentEntry {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  nicknames: string[];
  /** Display label for review cards. */
  display: string;
  /** Searchable strings — fed to Fuse. */
  needles: string[];
}

export interface SubtopicEntry {
  id: string;
  name: string;
  topicId: string;
  aliases: string[];
  display: string;
  needles: string[];
}

export interface RosterIndex {
  students: Fuse<StudentEntry>;
  subtopics: Fuse<SubtopicEntry>;
  studentEntries: StudentEntry[];
  subtopicEntries: SubtopicEntry[];
}

const FUSE_OPTS = {
  includeScore: true,
  threshold: 0.3,
  ignoreLocation: true,
  keys: ["needles"],
};

let cached: { schoolId: string; index: RosterIndex } | null = null;

export async function buildRosterIndex(opts: { force?: boolean } = {}): Promise<RosterIndex> {
  const db = getDb();
  if (cached && !opts.force) return cached.index;

  const [encryptedStudents, subtopicRows] = await Promise.all([
    db.roster.toArray(),
    db.curriculumSubtopics.toArray(),
  ]);

  const studentEntries: StudentEntry[] = await Promise.all(
    encryptedStudents.map(async (enc) => {
      const r = await decryptRoster(enc);
      const display = r.preferredName
        ? `${r.preferredName} ${r.lastName}`
        : `${r.firstName} ${r.lastName}`;
      const needles = [
        r.firstName,
        r.lastName,
        `${r.firstName} ${r.lastName}`,
        r.preferredName ?? "",
        ...(r.preferredName ? [`${r.preferredName} ${r.lastName}`] : []),
        ...r.nicknames,
      ].filter(Boolean);
      return {
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        preferredName: r.preferredName ?? null,
        nicknames: r.nicknames,
        display,
        needles,
      };
    })
  );

  const subtopicEntries: SubtopicEntry[] = subtopicRows.map((s) => ({
    id: s.id,
    name: s.name,
    topicId: s.topicId,
    aliases: s.aliases ?? [],
    display: s.name,
    needles: [s.name, ...(s.aliases ?? [])],
  }));

  const index: RosterIndex = {
    students: new Fuse(studentEntries, FUSE_OPTS),
    subtopics: new Fuse(subtopicEntries, FUSE_OPTS),
    studentEntries,
    subtopicEntries,
  };
  // We don't track schoolId here yet — the caller scopes by Dexie which is per-app.
  cached = { schoolId: "", index };
  return index;
}

export function invalidateRosterIndex() {
  cached = null;
}
