"use client";

import { initSessionKeys } from "@/lib/crypto/session-key";
import {
  prepareEncryptedGuardian,
  prepareEncryptedRoster,
  rosterNameHash,
} from "@/lib/db/encrypted-fields";
import { getDb } from "@/lib/db/schema";

interface PullResponse {
  salt: string;
  schoolId: string;
  userId: string;
  data: {
    students: Array<{
      id: string;
      school_id: string;
      first_name: string;
      last_name: string;
      preferred_name: string | null;
      birth_date: string | null;
      nicknames: string[];
      notes: string | null;
    }>;
    enrollments: Array<{
      id: string;
      student_id: string;
      classroom_id: string;
      start_date: string;
      end_date: string | null;
      is_primary: boolean;
    }>;
    classrooms: Array<{
      id: string;
      school_id: string;
      curriculum_id: string | null;
      name: string;
      code: string | null;
      status: string;
    }>;
    classroom_teachers: Array<{
      id: string;
      classroom_id: string;
      teacher_user_id: string;
      classroom_role: "lead" | "support" | "assistant" | null;
      start_date: string;
      end_date: string | null;
    }>;
    guardians: Array<{
      id: string;
      school_id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      preferred_contact_method: "email" | "phone" | "either" | null;
    }>;
    student_guardians: Array<{
      id: string;
      student_id: string;
      guardian_id: string;
      relationship: string | null;
      is_primary_contact: boolean;
      receives_reports: boolean;
    }>;
    curricula: Array<{
      id: string;
      school_id: string;
      name: string;
      framework: string;
      is_active: boolean;
    }>;
    curriculum_topics: Array<{
      id: string;
      curriculum_id: string;
      name: string;
      sort_order: number;
      is_active: boolean;
    }>;
    curriculum_subtopics: Array<{
      id: string;
      topic_id: string;
      name: string;
      sort_order: number;
      is_active: boolean;
      aliases: string[];
    }>;
  };
}

export async function pullSync() {
  const res = await fetch("/api/v1/sync/pull", { method: "GET", credentials: "include" });
  if (!res.ok) throw new Error(`Sync pull failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as PullResponse;

  // Bootstrap encryption keys before any write to PII tables.
  await initSessionKeys({ userId: body.userId, schoolId: body.schoolId, saltB64: body.salt });

  const db = getDb();

  const rosterRows = await Promise.all(
    body.data.students.map(async (s) =>
      prepareEncryptedRoster({
        id: s.id,
        schoolId: s.school_id,
        firstName: s.first_name,
        lastName: s.last_name,
        preferredName: s.preferred_name,
        birthDate: s.birth_date,
        nicknames: s.nicknames ?? [],
        notes: s.notes,
        nameHash: await rosterNameHash(s.first_name, s.last_name),
      })
    )
  );

  const guardianRows = await Promise.all(
    body.data.guardians.map(async (g) =>
      prepareEncryptedGuardian({
        id: g.id,
        schoolId: g.school_id,
        firstName: g.first_name,
        lastName: g.last_name,
        email: g.email,
        phone: g.phone,
        preferredContactMethod: g.preferred_contact_method,
        nameHash: await rosterNameHash(g.first_name, g.last_name),
      })
    )
  );

  await db.transaction(
    "rw",
    [
      db.roster,
      db.enrollments,
      db.classrooms,
      db.classroomTeachers,
      db.guardians,
      db.studentGuardians,
      db.curricula,
      db.curriculumTopics,
      db.curriculumSubtopics,
      db.syncMeta,
    ],
    async () => {
      await db.roster.clear();
      await db.roster.bulkPut(rosterRows);

      await db.enrollments.clear();
      await db.enrollments.bulkPut(
        body.data.enrollments.map((e) => ({
          id: e.id,
          studentId: e.student_id,
          classroomId: e.classroom_id,
          startDate: e.start_date,
          endDate: e.end_date,
          isPrimary: e.is_primary,
        }))
      );

      await db.classrooms.clear();
      await db.classrooms.bulkPut(
        body.data.classrooms.map((c) => ({
          id: c.id,
          schoolId: c.school_id,
          curriculumId: c.curriculum_id,
          name: c.name,
          code: c.code,
          status: c.status,
        }))
      );

      await db.classroomTeachers.clear();
      await db.classroomTeachers.bulkPut(
        body.data.classroom_teachers.map((t) => ({
          id: t.id,
          classroomId: t.classroom_id,
          teacherUserId: t.teacher_user_id,
          classroomRole: t.classroom_role,
          startDate: t.start_date,
          endDate: t.end_date,
        }))
      );

      await db.guardians.clear();
      await db.guardians.bulkPut(guardianRows);

      await db.studentGuardians.clear();
      await db.studentGuardians.bulkPut(
        body.data.student_guardians.map((sg) => ({
          id: sg.id,
          studentId: sg.student_id,
          guardianId: sg.guardian_id,
          relationship: sg.relationship,
          isPrimaryContact: sg.is_primary_contact,
          receivesReports: sg.receives_reports,
        }))
      );

      await db.curricula.clear();
      await db.curricula.bulkPut(
        body.data.curricula.map((c) => ({
          id: c.id,
          schoolId: c.school_id,
          name: c.name,
          framework: c.framework,
          isActive: c.is_active,
        }))
      );

      await db.curriculumTopics.clear();
      await db.curriculumTopics.bulkPut(
        body.data.curriculum_topics.map((t) => ({
          id: t.id,
          curriculumId: t.curriculum_id,
          name: t.name,
          sortOrder: t.sort_order,
          isActive: t.is_active,
        }))
      );

      await db.curriculumSubtopics.clear();
      await db.curriculumSubtopics.bulkPut(
        body.data.curriculum_subtopics.map((s) => ({
          id: s.id,
          topicId: s.topic_id,
          name: s.name,
          sortOrder: s.sort_order,
          isActive: s.is_active,
          aliases: s.aliases ?? [],
        }))
      );

      await db.syncMeta.put({ key: "last_pulled_at", value: new Date().toISOString() });
    }
  );

  return { schoolId: body.schoolId, userId: body.userId };
}
