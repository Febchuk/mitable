-- Give existing Toddler's House rooms without a curriculum the school's
-- populated general Toddler's House curriculum. Preserve explicit assignments.
update public.classrooms as room
set curriculum_id = curriculum.id
from public.curricula as curriculum
where room.school_id = curriculum.school_id
  and lower(btrim(room.code)) = 'toddler'
  and room.name like 'Toddler''s House%'
  and room.curriculum_id is null
  and curriculum.name = 'Toddler''s House'
  and 1 = (
    select count(*) from public.curricula as candidate
    where candidate.school_id = room.school_id
      and candidate.name = 'Toddler''s House'
  )
  and exists (
    select 1 from public.curriculum_topics as topic
    join public.curriculum_subtopics as material on material.topic_id = topic.id
    where topic.curriculum_id = curriculum.id
  );
