import { reportMemoryDb } from "./report-memory-db";

export const ROOM = "11111111-1111-4111-8111-111111111111";
export const CHILD = "22222222-2222-4222-8222-222222222222";
export const GUARDIAN = "33333333-3333-4333-8333-333333333333";
export const DAY = "2026-10-20";
export function toddlerReportFixture() {
  const student = {
    id: CHILD,
    first_name: "Ada",
    last_name: "Stone",
    preferred_name: null,
    school_id: "school",
    archived_at: null,
  };
  return reportMemoryDb({
    classrooms: [
      {
        id: ROOM,
        name: "Toddler's House",
        code: "Toddler",
        school_id: "school",
        curriculum_id: "curriculum",
      },
    ],
    students: [student],
    student_classroom_enrollments: [
      {
        classroom_id: ROOM,
        student_id: CHILD,
        end_date: null,
        students: student,
        is_primary: true,
      },
    ],
    curriculum_subjects: [
      {
        id: "subject",
        name: "Practical Life",
        sort_order: 0,
        curriculum_id: "curriculum",
        curriculum_topics: [
          {
            id: "topic",
            name: "Fine motor",
            sort_order: 0,
            curriculum_subtopics: [{ id: "beads", name: "Stringing", sort_order: 0 }],
          },
        ],
      },
    ],
    student_progress_history: [
      {
        student_id: CHILD,
        curriculum_subtopic_id: "beads",
        new_status: "practicing",
        changed_at: `${DAY}T09:00:00.000Z`,
        comment: "Threaded three beads independently.",
      },
    ],
    toddler_daily_logs: [
      {
        id: "log",
        school_id: "school",
        classroom_id: ROOM,
        student_id: CHILD,
        log_date: DAY,
        mood: "Cheerful",
        nap: "Slept briefly",
        activity_labels: ["Painting"],
        teacher_comments: "Shared the paintbrush.",
      },
    ],
    attendance_records: [
      {
        student_id: CHILD,
        classroom_id: ROOM,
        attendance_date: DAY,
        status: "present",
        arrival_time: "08:00:00",
      },
    ],
    student_guardians: [
      {
        student_id: CHILD,
        guardian_id: GUARDIAN,
        receives_reports: true,
        guardians: { id: GUARDIAN, email: "parent@example.test" },
      },
    ],
    reports: [],
    report_review_actions: [],
    report_recipients: [],
  });
}
