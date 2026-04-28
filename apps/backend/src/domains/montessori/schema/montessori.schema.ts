import {
    pgTable,
    uuid,
    varchar,
    text,
    integer,
    smallint,
    boolean,
    date,
    jsonb,
    timestamp,
    index,
    unique,
    type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { organizations } from "../../auth/schema/organizations.schema";
import { users } from "../../auth/schema/users.schema";

/**
 * Montessori domain
 *
 * All entities for the Montessori-for-Schools product live here. Every table
 * is scoped to an organization (one organization == one school in this
 * product). The product never reads or writes to tables outside this file
 * other than the existing organizations/users foreign keys.
 *
 * The schema is intentionally consolidated into one module so the small
 * forward references between observations/attendance and agent_messages
 * resolve without cross-file gymnastics.
 */

// ─── Classrooms ──────────────────────────────────────────────────────

export const montessoriClassrooms = pgTable(
    "montessori_classrooms",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "cascade" }),
        name: varchar("name", { length: 120 }).notNull(),
        // 'primary' | 'elementary' | 'both'
        level: varchar("level", { length: 20 }).notNull(),
        ageRange: varchar("age_range", { length: 50 }),
        teacherId: uuid("teacher_id").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        orgIdx: index("idx_montessori_classrooms_org").on(table.organizationId),
    })
);

// ─── Students ────────────────────────────────────────────────────────

export const montessoriStudents = pgTable(
    "montessori_students",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "cascade" }),
        classroomId: uuid("classroom_id")
            .notNull()
            .references(() => montessoriClassrooms.id, { onDelete: "cascade" }),
        name: varchar("name", { length: 120 }).notNull(),
        age: integer("age"),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        orgIdx: index("idx_montessori_students_org").on(table.organizationId),
        classroomIdx: index("idx_montessori_students_classroom").on(table.classroomId),
    })
);

// ─── Curriculum: domains + topics ────────────────────────────────────

export const montessoriDomains = pgTable(
    "montessori_domains",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "cascade" }),
        name: varchar("name", { length: 120 }).notNull(),
        // 'primary' | 'elementary' | 'both'
        level: varchar("level", { length: 20 }).notNull(),
        colorHue: smallint("color_hue").notNull().default(200),
        active: boolean("active").notNull().default(true),
        sortOrder: integer("sort_order").notNull().default(0),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        orgIdx: index("idx_montessori_domains_org").on(table.organizationId),
    })
);

export const montessoriTopics = pgTable(
    "montessori_topics",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "cascade" }),
        domainId: uuid("domain_id")
            .notNull()
            .references(() => montessoriDomains.id, { onDelete: "cascade" }),
        name: varchar("name", { length: 200 }).notNull(),
        // 'primary' | 'elementary' | 'both'
        level: varchar("level", { length: 20 }).notNull(),
        active: boolean("active").notNull().default(true),
        sortOrder: integer("sort_order").notNull().default(0),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        orgIdx: index("idx_montessori_topics_org").on(table.organizationId),
        domainIdx: index("idx_montessori_topics_domain").on(table.domainId),
    })
);

// ─── Agent threads + messages ────────────────────────────────────────
// Declared above observations/attendance so those tables can reference
// agent_messages.id without a forward declaration.

export const montessoriAgentThreads = pgTable(
    "montessori_agent_threads",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "cascade" }),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        title: varchar("title", { length: 200 }).notNull().default("New conversation"),
        // 'admin' | 'teacher-primary' | 'teacher-elementary'
        roleAtCreation: varchar("role_at_creation", { length: 30 }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        orgUserIdx: index("idx_montessori_threads_org_user").on(
            table.organizationId,
            table.userId
        ),
    })
);

export const montessoriAgentMessages = pgTable(
    "montessori_agent_messages",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        threadId: uuid("thread_id")
            .notNull()
            .references(() => montessoriAgentThreads.id, { onDelete: "cascade" }),
        // 'user' | 'agent'
        role: varchar("role", { length: 10 }).notNull(),
        text: text("text"),
        // ConfirmationCard | ProgressCard | GridPreviewCard | ReportPreviewCard
        // | TextAnswerCard — see apps/montessori/src/types
        card: jsonb("card"),
        // 'text' | 'voice' | 'photo' | 'agent' | 'grid'
        inputMethod: varchar("input_method", { length: 20 }),
        // Lightweight metadata about a media capture (kind, durationMs,
        // sizeBytes). NEVER the bytes themselves — raw audio/photos are
        // deleted server-side immediately after Gemini interpretation.
        attachmentMeta: jsonb("attachment_meta"),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        threadIdx: index("idx_montessori_messages_thread").on(table.threadId, table.createdAt),
    })
);

// ─── Observations (the daily progress tracker source of truth) ──────

export const montessoriObservations = pgTable(
    "montessori_observations",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "cascade" }),
        studentId: uuid("student_id")
            .notNull()
            .references(() => montessoriStudents.id, { onDelete: "cascade" }),
        topicId: uuid("topic_id")
            .notNull()
            .references(() => montessoriTopics.id, { onDelete: "cascade" }),
        // 'introduced' | 'practising' | 'mastered'. We never persist
        // 'not-introduced' — absence of a row is the empty state.
        level: varchar("level", { length: 20 }).notNull(),
        note: text("note"),
        summary: text("summary"),
        // 'grid' | 'text' | 'voice' | 'photo' | 'agent'
        inputMethod: varchar("input_method", { length: 20 }).notNull().default("grid"),
        // 'teacher' | 'agent'
        authorType: varchar("author_type", { length: 20 }).notNull().default("teacher"),
        authorUserId: uuid("author_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
        // The agent message that proposed this observation, if any. Outlives
        // the message: set-null on delete preserves the observation.
        authorAgentMessageId: uuid("author_agent_message_id").references(
            (): AnyPgColumn => montessoriAgentMessages.id,
            { onDelete: "set null" }
        ),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        // Latest-wins lookup for the grid: fetch newest row per (student, topic)
        latestIdx: index("idx_montessori_observations_latest").on(
            table.studentId,
            table.topicId,
            table.createdAt
        ),
        orgIdx: index("idx_montessori_observations_org").on(table.organizationId),
    })
);

// ─── Attendance ──────────────────────────────────────────────────────

export const montessoriAttendance = pgTable(
    "montessori_attendance",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "cascade" }),
        studentId: uuid("student_id")
            .notNull()
            .references(() => montessoriStudents.id, { onDelete: "cascade" }),
        date: date("date").notNull(),
        // 'present' | 'absent'
        status: varchar("status", { length: 10 }).notNull(),
        note: text("note"),
        authorAgentMessageId: uuid("author_agent_message_id").references(
            (): AnyPgColumn => montessoriAgentMessages.id,
            { onDelete: "set null" }
        ),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        orgIdx: index("idx_montessori_attendance_org").on(table.organizationId),
        // One canonical row per student per day. Reapplied attendance updates
        // do an upsert on this constraint.
        uniqueStudentDate: unique("uniq_montessori_attendance_student_date").on(
            table.studentId,
            table.date
        ),
    })
);

// ─── Report templates ────────────────────────────────────────────────

export const montessoriReportTemplates = pgTable(
    "montessori_report_templates",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "cascade" }),
        name: varchar("name", { length: 200 }).notNull(),
        originalFilename: varchar("original_filename", { length: 300 }).notNull(),
        // 'docx' | 'pdf'
        sourceFormat: varchar("source_format", { length: 10 }).notNull(),
        // Path within the configured Supabase Storage bucket.
        storagePath: varchar("storage_path", { length: 500 }).notNull(),
        // Parsed structure: { placeholders: string[], sections: [...], rawText?: string }
        parsedStructure: jsonb("parsed_structure").notNull().default("{}"),
        uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        orgIdx: index("idx_montessori_report_templates_org").on(table.organizationId),
    })
);

// ─── Reports ─────────────────────────────────────────────────────────

export const montessoriReports = pgTable(
    "montessori_reports",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        organizationId: uuid("organization_id")
            .notNull()
            .references(() => organizations.id, { onDelete: "cascade" }),
        studentId: uuid("student_id")
            .notNull()
            .references(() => montessoriStudents.id, { onDelete: "cascade" }),
        classroomId: uuid("classroom_id")
            .notNull()
            .references(() => montessoriClassrooms.id, { onDelete: "cascade" }),
        templateId: uuid("template_id").references(() => montessoriReportTemplates.id, {
            onDelete: "set null",
        }),
        // 'end-of-term' | 'activity-update'
        type: varchar("type", { length: 30 }).notNull(),
        // 'draft' | 'approved' | 'sent'
        status: varchar("status", { length: 20 }).notNull().default("draft"),
        summary: text("summary"),
        // [{ domainId, narrative }]
        sections: jsonb("sections").notNull().default("[]"),
        // Storage paths to generated files, populated when the teacher
        // approves a draft and downloadable artefacts are generated.
        generatedDocxPath: varchar("generated_docx_path", { length: 500 }),
        generatedPdfPath: varchar("generated_pdf_path", { length: 500 }),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
        approvedAt: timestamp("approved_at", { withTimezone: true }),
        sentAt: timestamp("sent_at", { withTimezone: true }),
    },
    (table) => ({
        orgIdx: index("idx_montessori_reports_org").on(table.organizationId),
        studentIdx: index("idx_montessori_reports_student").on(table.studentId),
    })
);

// ─── Relations ───────────────────────────────────────────────────────

export const montessoriClassroomsRelations = relations(montessoriClassrooms, ({ one, many }) => ({
    organization: one(organizations, {
        fields: [montessoriClassrooms.organizationId],
        references: [organizations.id],
    }),
    teacher: one(users, {
        fields: [montessoriClassrooms.teacherId],
        references: [users.id],
    }),
    students: many(montessoriStudents),
    reports: many(montessoriReports),
}));

export const montessoriStudentsRelations = relations(montessoriStudents, ({ one, many }) => ({
    classroom: one(montessoriClassrooms, {
        fields: [montessoriStudents.classroomId],
        references: [montessoriClassrooms.id],
    }),
    observations: many(montessoriObservations),
    attendance: many(montessoriAttendance),
    reports: many(montessoriReports),
}));

export const montessoriDomainsRelations = relations(montessoriDomains, ({ many }) => ({
    topics: many(montessoriTopics),
}));

export const montessoriTopicsRelations = relations(montessoriTopics, ({ one, many }) => ({
    domain: one(montessoriDomains, {
        fields: [montessoriTopics.domainId],
        references: [montessoriDomains.id],
    }),
    observations: many(montessoriObservations),
}));

export const montessoriObservationsRelations = relations(montessoriObservations, ({ one }) => ({
    student: one(montessoriStudents, {
        fields: [montessoriObservations.studentId],
        references: [montessoriStudents.id],
    }),
    topic: one(montessoriTopics, {
        fields: [montessoriObservations.topicId],
        references: [montessoriTopics.id],
    }),
    authorUser: one(users, {
        fields: [montessoriObservations.authorUserId],
        references: [users.id],
    }),
    authorAgentMessage: one(montessoriAgentMessages, {
        fields: [montessoriObservations.authorAgentMessageId],
        references: [montessoriAgentMessages.id],
    }),
}));

export const montessoriAttendanceRelations = relations(montessoriAttendance, ({ one }) => ({
    student: one(montessoriStudents, {
        fields: [montessoriAttendance.studentId],
        references: [montessoriStudents.id],
    }),
}));

export const montessoriReportTemplatesRelations = relations(
    montessoriReportTemplates,
    ({ one, many }) => ({
        organization: one(organizations, {
            fields: [montessoriReportTemplates.organizationId],
            references: [organizations.id],
        }),
        reports: many(montessoriReports),
    })
);

export const montessoriReportsRelations = relations(montessoriReports, ({ one }) => ({
    student: one(montessoriStudents, {
        fields: [montessoriReports.studentId],
        references: [montessoriStudents.id],
    }),
    classroom: one(montessoriClassrooms, {
        fields: [montessoriReports.classroomId],
        references: [montessoriClassrooms.id],
    }),
    template: one(montessoriReportTemplates, {
        fields: [montessoriReports.templateId],
        references: [montessoriReportTemplates.id],
    }),
}));

export const montessoriAgentThreadsRelations = relations(montessoriAgentThreads, ({ many }) => ({
    messages: many(montessoriAgentMessages),
}));

export const montessoriAgentMessagesRelations = relations(montessoriAgentMessages, ({ one }) => ({
    thread: one(montessoriAgentThreads, {
        fields: [montessoriAgentMessages.threadId],
        references: [montessoriAgentThreads.id],
    }),
}));

// ─── Type exports ────────────────────────────────────────────────────

export type MontessoriClassroom = typeof montessoriClassrooms.$inferSelect;
export type NewMontessoriClassroom = typeof montessoriClassrooms.$inferInsert;
export type MontessoriStudent = typeof montessoriStudents.$inferSelect;
export type NewMontessoriStudent = typeof montessoriStudents.$inferInsert;
export type MontessoriDomain = typeof montessoriDomains.$inferSelect;
export type NewMontessoriDomain = typeof montessoriDomains.$inferInsert;
export type MontessoriTopic = typeof montessoriTopics.$inferSelect;
export type NewMontessoriTopic = typeof montessoriTopics.$inferInsert;
export type MontessoriObservation = typeof montessoriObservations.$inferSelect;
export type NewMontessoriObservation = typeof montessoriObservations.$inferInsert;
export type MontessoriAttendanceEntry = typeof montessoriAttendance.$inferSelect;
export type NewMontessoriAttendanceEntry = typeof montessoriAttendance.$inferInsert;
export type MontessoriReport = typeof montessoriReports.$inferSelect;
export type NewMontessoriReport = typeof montessoriReports.$inferInsert;
export type MontessoriReportTemplate = typeof montessoriReportTemplates.$inferSelect;
export type NewMontessoriReportTemplate = typeof montessoriReportTemplates.$inferInsert;
export type MontessoriAgentThread = typeof montessoriAgentThreads.$inferSelect;
export type NewMontessoriAgentThread = typeof montessoriAgentThreads.$inferInsert;
export type MontessoriAgentMessage = typeof montessoriAgentMessages.$inferSelect;
export type NewMontessoriAgentMessage = typeof montessoriAgentMessages.$inferInsert;
