import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

export async function findStudentInSchool(studentId: string, schoolId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("students")
    .select("id, school_id")
    .eq("id", studentId)
    .eq("school_id", schoolId)
    .is("archived_at", null)
    .maybeSingle();
  return { data, error };
}

export async function findClassroomInSchool(classroomId: string, schoolId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("classrooms")
    .select("id, school_id")
    .eq("id", classroomId)
    .eq("school_id", schoolId)
    .eq("status", "active")
    .maybeSingle();
  return { data, error };
}

export async function findGuardianInSchool(guardianId: string, schoolId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("guardians")
    .select("id, school_id")
    .eq("id", guardianId)
    .eq("school_id", schoolId)
    .maybeSingle();
  return { data, error };
}

export async function findTeacherInSchool(teacherId: string, schoolId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id, school_id")
    .eq("id", teacherId)
    .eq("school_id", schoolId)
    .eq("role", "teacher")
    .eq("status", "active")
    .maybeSingle();
  return { data, error };
}

export function inaccessibleResource(
  resource: "Student" | "Classroom" | "Report" | "Guardian" | "Teacher" | "Assignment"
) {
  // Do not disclose whether a record belongs to another school.
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 });
}
