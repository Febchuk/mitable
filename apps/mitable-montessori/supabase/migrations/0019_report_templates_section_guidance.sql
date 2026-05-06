-- =============================================================================
-- 0019 — Per-section guidance for report templates
--
-- 0017 added `report_templates.sections text[]` (heading list only). The
-- drafting agent needs prose-style guidance per heading so it knows what to
-- write in each section. Storing the guidance map as JSONB on the same row
-- avoids a join and lets admins author templates with a single INSERT.
-- =============================================================================

alter table report_templates
  add column if not exists section_guidance jsonb not null default '{}'::jsonb;

-- Reseed function: same five starter templates, now with guidance per heading.
-- Idempotent — uses on conflict (school_id, name) so reruns won't duplicate.
-- Existing rows seeded by 0017 will get their guidance filled below.
create or replace function seed_default_report_templates(p_school_id uuid)
returns void language plpgsql as $$
begin
  insert into report_templates (school_id, name, description, kind, sections, section_guidance, icon_tone)
  values
    (
      p_school_id,
      'Sunflower daily',
      'Morning · Language · Math · Afternoon · Social',
      'Daily',
      array['Morning','Language','Math','Afternoon','Social'],
      jsonb_build_object(
        'Morning',   'Describe arrival, mood at drop-off, and the first work the child chose. One short paragraph.',
        'Language',  'Note any letter sounds practiced, vocabulary used, storytelling, or reading. One short paragraph.',
        'Math',      'Mention which math materials they used and what concept clicked or challenged them. One short paragraph.',
        'Afternoon', 'Cover lunch, rest, and outdoor or extended-work time after lunch. One short paragraph.',
        'Social',    'How they interacted with peers and adults today — collaboration, conflict, kindness, leadership. One short paragraph.'
      ),
      'clay'
    ),
    (
      p_school_id,
      'Spring milestone',
      'Term summary across areas',
      'Major',
      array['Overview','Math','Language','Social','Family note'],
      jsonb_build_object(
        'Overview',     'A warm 1–2 paragraph summary of the child this term: growth themes, personality at school, areas of focus.',
        'Math',         'Term-level progress in math. Materials mastered, concepts emerging, what to watch next term. 1–2 paragraphs.',
        'Language',     'Term-level progress in language and literacy. Sounds, words, writing, reading. 1–2 paragraphs.',
        'Social',       'Friendships, group work, conflict resolution, classroom citizenship over the term. 1–2 paragraphs.',
        'Family note',  'A direct note to the family — appreciation, partnership suggestions, what to celebrate at home. One paragraph.'
      ),
      'butter'
    ),
    (
      p_school_id,
      'Incident — minor',
      'What happened · Care given · Follow-up',
      'Incident',
      array['What happened','Care given','Follow-up'],
      jsonb_build_object(
        'What happened',  'Plain factual recount of the incident — when, where, what was observed. No interpretation.',
        'Care given',     'What the staff did in response. First aid, comfort, communication with the child.',
        'Follow-up',      'What we are watching for, what we ask the family to watch for, and any next steps.'
      ),
      'blue'
    ),
    (
      p_school_id,
      'First-week intro',
      'Settling in · First works · Family questions',
      'Major',
      array['Settling in','First works','Family questions'],
      jsonb_build_object(
        'Settling in',       'How the child is adjusting to the classroom rhythm, separations, and routines. One paragraph.',
        'First works',       'The first materials and activities they have gravitated to. One paragraph.',
        'Family questions',  'Open questions or observations to share with the family for the first parent meeting.'
      ),
      'sage'
    ),
    (
      p_school_id,
      'Quick check-in',
      'One paragraph · Family-only',
      'Daily',
      array['Today'],
      jsonb_build_object(
        'Today', 'A single warm paragraph for the family — one or two specific moments from the day. No headings, no lists.'
      ),
      'clay'
    )
  on conflict do nothing;

  -- Backfill guidance for rows that 0017 already inserted with empty {} guidance.
  update report_templates rt
  set section_guidance = src.section_guidance
  from (
    values
      ('Sunflower daily',  jsonb_build_object(
        'Morning',   'Describe arrival, mood at drop-off, and the first work the child chose. One short paragraph.',
        'Language',  'Note any letter sounds practiced, vocabulary used, storytelling, or reading. One short paragraph.',
        'Math',      'Mention which math materials they used and what concept clicked or challenged them. One short paragraph.',
        'Afternoon', 'Cover lunch, rest, and outdoor or extended-work time after lunch. One short paragraph.',
        'Social',    'How they interacted with peers and adults today — collaboration, conflict, kindness, leadership. One short paragraph.'
      )),
      ('Spring milestone', jsonb_build_object(
        'Overview',     'A warm 1–2 paragraph summary of the child this term: growth themes, personality at school, areas of focus.',
        'Math',         'Term-level progress in math. Materials mastered, concepts emerging, what to watch next term. 1–2 paragraphs.',
        'Language',     'Term-level progress in language and literacy. Sounds, words, writing, reading. 1–2 paragraphs.',
        'Social',       'Friendships, group work, conflict resolution, classroom citizenship over the term. 1–2 paragraphs.',
        'Family note',  'A direct note to the family — appreciation, partnership suggestions, what to celebrate at home. One paragraph.'
      )),
      ('Incident — minor', jsonb_build_object(
        'What happened',  'Plain factual recount of the incident — when, where, what was observed. No interpretation.',
        'Care given',     'What the staff did in response. First aid, comfort, communication with the child.',
        'Follow-up',      'What we are watching for, what we ask the family to watch for, and any next steps.'
      )),
      ('First-week intro', jsonb_build_object(
        'Settling in',       'How the child is adjusting to the classroom rhythm, separations, and routines. One paragraph.',
        'First works',       'The first materials and activities they have gravitated to. One paragraph.',
        'Family questions',  'Open questions or observations to share with the family for the first parent meeting.'
      )),
      ('Quick check-in',   jsonb_build_object(
        'Today', 'A single warm paragraph for the family — one or two specific moments from the day. No headings, no lists.'
      ))
  ) as src(name, section_guidance)
  where rt.school_id = p_school_id
    and rt.name = src.name
    and (rt.section_guidance is null or rt.section_guidance = '{}'::jsonb);
end;
$$;

-- Apply the reseed (insert + backfill) for every existing school.
do $$
declare
  s record;
begin
  for s in select id from schools loop
    perform seed_default_report_templates(s.id);
  end loop;
end $$;
