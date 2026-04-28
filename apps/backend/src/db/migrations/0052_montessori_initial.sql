-- Montessori product — initial schema.
-- All tables are organization-scoped (one organization == one school).
-- Idempotent: safe to re-run.

-- ─── Classrooms ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS montessori_classrooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    level VARCHAR(20) NOT NULL,           -- 'primary' | 'elementary' | 'both'
    age_range VARCHAR(50),
    teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_montessori_classrooms_org ON montessori_classrooms(organization_id);

-- ─── Students ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS montessori_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    classroom_id UUID NOT NULL REFERENCES montessori_classrooms(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    age INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_montessori_students_org ON montessori_students(organization_id);
CREATE INDEX IF NOT EXISTS idx_montessori_students_classroom ON montessori_students(classroom_id);

-- ─── Curriculum: domains + topics ────────────────────────────────────
CREATE TABLE IF NOT EXISTS montessori_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    level VARCHAR(20) NOT NULL,
    color_hue SMALLINT NOT NULL DEFAULT 200,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_montessori_domains_org ON montessori_domains(organization_id);

CREATE TABLE IF NOT EXISTS montessori_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    domain_id UUID NOT NULL REFERENCES montessori_domains(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    level VARCHAR(20) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_montessori_topics_org ON montessori_topics(organization_id);
CREATE INDEX IF NOT EXISTS idx_montessori_topics_domain ON montessori_topics(domain_id);

-- ─── Agent threads + messages ────────────────────────────────────────
-- Created before observations/attendance so the FK from those tables
-- to agent_messages.id resolves cleanly on first run.

CREATE TABLE IF NOT EXISTS montessori_agent_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL DEFAULT 'New conversation',
    role_at_creation VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_montessori_threads_org_user
    ON montessori_agent_threads(organization_id, user_id);

CREATE TABLE IF NOT EXISTS montessori_agent_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES montessori_agent_threads(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL,
    text TEXT,
    card JSONB,
    input_method VARCHAR(20),
    -- Only metadata about a media capture (kind, durationMs, sizeBytes).
    -- Raw audio/photo bytes are deleted server-side immediately after
    -- Gemini interpretation completes.
    attachment_meta JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_montessori_messages_thread
    ON montessori_agent_messages(thread_id, created_at);

-- ─── Observations (the daily progress tracker source of truth) ──────
CREATE TABLE IF NOT EXISTS montessori_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES montessori_students(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES montessori_topics(id) ON DELETE CASCADE,
    -- 'introduced' | 'practising' | 'mastered'
    -- Absence of a row is the empty state; we never persist 'not-introduced'.
    level VARCHAR(20) NOT NULL,
    note TEXT,
    summary TEXT,
    input_method VARCHAR(20) NOT NULL DEFAULT 'grid',
    author_type VARCHAR(20) NOT NULL DEFAULT 'teacher',
    author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    -- The agent message that proposed this observation, if any. The row
    -- outlives the message: SET NULL preserves the observation.
    author_agent_message_id UUID REFERENCES montessori_agent_messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_montessori_observations_latest
    ON montessori_observations(student_id, topic_id, created_at);
CREATE INDEX IF NOT EXISTS idx_montessori_observations_org
    ON montessori_observations(organization_id);

-- ─── Attendance ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS montessori_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES montessori_students(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status VARCHAR(10) NOT NULL,            -- 'present' | 'absent'
    note TEXT,
    author_agent_message_id UUID REFERENCES montessori_agent_messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uniq_montessori_attendance_student_date UNIQUE (student_id, date)
);
CREATE INDEX IF NOT EXISTS idx_montessori_attendance_org ON montessori_attendance(organization_id);

-- ─── Report templates ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS montessori_report_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    original_filename VARCHAR(300) NOT NULL,
    source_format VARCHAR(10) NOT NULL,     -- 'docx' | 'pdf'
    storage_path VARCHAR(500) NOT NULL,
    parsed_structure JSONB NOT NULL DEFAULT '{}'::jsonb,
    uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_montessori_report_templates_org
    ON montessori_report_templates(organization_id);

-- ─── Reports ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS montessori_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES montessori_students(id) ON DELETE CASCADE,
    classroom_id UUID NOT NULL REFERENCES montessori_classrooms(id) ON DELETE CASCADE,
    template_id UUID REFERENCES montessori_report_templates(id) ON DELETE SET NULL,
    type VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    summary TEXT,
    sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    generated_docx_path VARCHAR(500),
    generated_pdf_path VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_montessori_reports_org ON montessori_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_montessori_reports_student ON montessori_reports(student_id);
