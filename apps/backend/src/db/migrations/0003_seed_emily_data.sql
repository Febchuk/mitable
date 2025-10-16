-- Seed Data for Emily Chen (Product Designer Onboarding)
-- This migration creates sample data for testing the employee experience

-- First, get Emily's user ID from auth.users (assuming email emily.chen@example.com)
-- We'll use a variable to store it
DO $$
DECLARE
    emily_user_id UUID;
    sarah_user_id UUID;
    org_id UUID;
    conversation_id_1 UUID;
    conversation_id_2 UUID;
BEGIN
    -- Get or create organization
    SELECT id INTO org_id FROM organizations WHERE domain = 'lorikeet.com' LIMIT 1;

    IF org_id IS NULL THEN
        INSERT INTO organizations (name, domain)
        VALUES ('Lorikeet', 'lorikeet.com')
        RETURNING id INTO org_id;
    END IF;

    -- Get Emily's user ID (assuming she's already created in Supabase Auth)
    SELECT id INTO emily_user_id FROM users WHERE email = 'emily.chen@example.com' LIMIT 1;

    -- If Emily doesn't exist in users table, create her
    IF emily_user_id IS NULL THEN
        -- Get from auth.users if exists
        SELECT id INTO emily_user_id FROM auth.users WHERE email = 'emily.chen@example.com' LIMIT 1;

        IF emily_user_id IS NOT NULL THEN
            INSERT INTO users (id, organization_id, email, first_name, last_name, role, current_week, start_date, status)
            VALUES (emily_user_id, org_id, 'emily.chen@example.com', 'Emily', 'Chen', 'employee', 2, CURRENT_DATE - INTERVAL '1 week', 'active');
        END IF;
    END IF;

    -- Create Sarah Williams (Expert) in Supabase Auth first if needed
    SELECT id INTO sarah_user_id FROM users WHERE email = 'sarah.williams@example.com' LIMIT 1;

    IF sarah_user_id IS NULL THEN
        -- Insert Sarah into users table with a new ID
        INSERT INTO users (id, organization_id, email, first_name, last_name, role, avatar_url, status)
        VALUES (gen_random_uuid(), org_id, 'sarah.williams@example.com', 'Sarah', 'Williams', 'employee', NULL, 'active')
        RETURNING id INTO sarah_user_id;
    END IF;

    -- Only proceed if Emily exists
    IF emily_user_id IS NOT NULL THEN

        -- ====================================
        -- ROADMAP TASKS FOR EMILY (4 weeks)
        -- ====================================

        -- Week 1: Setup & Orientation
        INSERT INTO user_roadmap_tasks (user_id, week_number, title, description, time_estimate, order_index, completed, completed_at) VALUES
        (emily_user_id, 1, 'Set up Figma workspace', 'Create your personal workspace and join the design team', '1 hour', 0, true, CURRENT_TIMESTAMP - INTERVAL '5 days'),
        (emily_user_id, 1, 'Install design system plugin', 'Install the Lorikeet Design System plugin for Figma', '30 minutes', 1, true, CURRENT_TIMESTAMP - INTERVAL '5 days'),
        (emily_user_id, 1, 'Review brand guidelines', 'Read through our brand identity and style guide documentation', '2 hours', 2, true, CURRENT_TIMESTAMP - INTERVAL '4 days'),
        (emily_user_id, 1, 'Complete design basics tutorial', 'Watch the internal Figma best practices video series', '3 hours', 3, false, NULL);

        -- Week 2: Product Knowledge
        INSERT INTO user_roadmap_tasks (user_id, week_number, title, description, time_estimate, order_index, completed, completed_at) VALUES
        (emily_user_id, 2, 'Attend product team standup', 'Join the Monday standup to understand current sprint goals', '30 minutes', 0, true, CURRENT_TIMESTAMP - INTERVAL '2 days'),
        (emily_user_id, 2, 'Review user research findings', 'Read the latest user research report in Confluence', '2 hours', 1, false, NULL),
        (emily_user_id, 2, 'Map user flows for checkout', 'Create user flow diagrams for the checkout process', '4 hours', 2, false, NULL),
        (emily_user_id, 2, 'Shadow senior designer', 'Spend an afternoon observing Sarah''s design review process', '3 hours', 3, false, NULL);

        -- Week 3: Hands-on Design
        INSERT INTO user_roadmap_tasks (user_id, week_number, title, description, time_estimate, order_index, completed) VALUES
        (emily_user_id, 3, 'Design mobile onboarding screens', 'Create high-fidelity mockups for the mobile app onboarding flow', '1 day', 0, false),
        (emily_user_id, 3, 'Prototype interaction patterns', 'Build interactive prototypes for key user interactions', '4 hours', 1, false),
        (emily_user_id, 3, 'Present to design team', 'Share your onboarding designs in the weekly design critique', '1 hour', 2, false);

        -- Week 4: Collaboration & Iteration
        INSERT INTO user_roadmap_tasks (user_id, week_number, title, description, time_estimate, order_index, completed) VALUES
        (emily_user_id, 4, 'Incorporate design feedback', 'Update designs based on team feedback from Week 3 presentation', '3 hours', 0, false),
        (emily_user_id, 4, 'Collaborate with engineering', 'Work with frontend team to ensure design feasibility', '2 hours', 1, false),
        (emily_user_id, 4, 'Document design decisions', 'Write design rationale and add annotations to Figma files', '2 hours', 2, false),
        (emily_user_id, 4, 'First design handoff', 'Prepare final assets and handoff documentation for developers', '4 hours', 3, false);

        -- ====================================
        -- NUDGES FOR EMILY
        -- ====================================

        IF sarah_user_id IS NOT NULL THEN
            INSERT INTO nudges (user_id, expert_id, context, question, match_score, match_reasons, status, delivery_channel, delivered_at, created_at) VALUES
            (emily_user_id, sarah_user_id, 'Emily is working on checkout user flows', 'I''m designing the checkout flow and want to make sure I''m following best practices. Would love to get your feedback on my initial wireframes!', 0.92, '["Expertise in e-commerce UX", "Designed similar checkout flows", "High helpfulness rating (4.8/5)", "Available this week"]', 'waiting', 'in_app', CURRENT_TIMESTAMP - INTERVAL '3 hours', CURRENT_TIMESTAMP - INTERVAL '3 hours'),
            (emily_user_id, sarah_user_id, 'Emily attended design critique and has follow-up questions', 'In the design critique you mentioned using progressive disclosure for complex forms. Could you share examples from our product where we''ve applied this pattern?', 0.88, '["Recently discussed this pattern", "Mentored 3 junior designers", "Expert in form design"]', 'waiting', 'in_app', CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '1 day');
        END IF;

        -- ====================================
        -- CONVERSATIONS FOR EMILY
        -- ====================================

        -- Conversation 1: Getting started with Figma
        INSERT INTO conversations (id, user_id, title, context_type, created_at, updated_at)
        VALUES (gen_random_uuid(), emily_user_id, 'Getting started with Figma', 'help_request', CURRENT_TIMESTAMP - INTERVAL '4 days', CURRENT_TIMESTAMP - INTERVAL '4 days')
        RETURNING id INTO conversation_id_1;

        INSERT INTO messages (conversation_id, role, content, message_type, created_at) VALUES
        (conversation_id_1, 'user', 'How do I access the shared component library in Figma?', 'text', CURRENT_TIMESTAMP - INTERVAL '4 days'),
        (conversation_id_1, 'assistant', 'To access the shared component library in Figma:\n\n1. Open your Figma file\n2. Click on the Assets panel (left sidebar, book icon)\n3. You should see "Lorikeet Design System" under Team libraries\n4. If you don''t see it, click the library icon → Enable "Lorikeet Design System"\n\nOnce enabled, you can drag components directly from the Assets panel into your designs. The library includes buttons, forms, cards, and navigation components.\n\nNeed help with any specific component?', 'text', CURRENT_TIMESTAMP - INTERVAL '4 days');

        -- Conversation 2: Design system guidelines
        INSERT INTO conversations (id, user_id, title, context_type, created_at, updated_at)
        VALUES (gen_random_uuid(), emily_user_id, 'Design system spacing guidelines', 'general', CURRENT_TIMESTAMP - INTERVAL '2 hours', CURRENT_TIMESTAMP - INTERVAL '2 hours')
        RETURNING id INTO conversation_id_2;

        INSERT INTO messages (conversation_id, role, content, message_type, created_at) VALUES
        (conversation_id_2, 'user', 'What spacing values should I use for layouts? I see different numbers in existing designs.', 'text', CURRENT_TIMESTAMP - INTERVAL '2 hours'),
        (conversation_id_2, 'assistant', 'Great question! Our design system uses an 8px spacing scale:\n\n**Base Unit:** 8px\n**Common values:**\n- 4px (0.5x) - Tight spacing within components\n- 8px (1x) - Default spacing between related elements\n- 16px (2x) - Section padding, card padding\n- 24px (3x) - Spacing between sections\n- 32px (4x) - Large gaps, page margins\n- 48px (6x) - Extra large spacing\n\n**Pro tip:** In Figma, hold Shift while dragging to snap to 8px increments. You can also use Auto Layout with 8px spacing presets.\n\nThe variations you''re seeing in old designs are from before we standardized. Always use the 8px scale for new work.', 'text', CURRENT_TIMESTAMP - INTERVAL '2 hours');

    END IF;

END $$;
