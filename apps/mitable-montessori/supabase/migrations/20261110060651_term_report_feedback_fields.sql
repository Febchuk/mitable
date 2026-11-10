-- These are teacher-written fields. Keep existing prose and sent reports intact.
do $$
declare
  report_row record;
  template_row record;
  field record;
  report_sections jsonb;
  template_sections text[];
  next_meta jsonb;
  existing_heading text;
  director_position integer;
  new_section jsonb;
begin
  for report_row in
    select id, sections, section_meta from public.reports
    where report_type = 'major' and status = 'draft'
      and jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) > 0
  loop
    report_sections := report_row.sections;
    next_meta := coalesce(report_row.section_meta, '{}'::jsonb);
    for field in
      select * from (values
        ('teacher-comment', 'Teacher''s comment'),
        ('specials-report', 'Specials report')
      ) as fields(id, heading)
    loop
      select s ->> 'heading' into existing_heading
      from jsonb_array_elements(report_sections) s
      where lower(translate(btrim(s ->> 'heading'), '’‘', '''''')) = lower(field.heading)
      limit 1;
      if existing_heading is null then
        existing_heading := field.heading;
        new_section := jsonb_build_object(
          'id', field.id, 'heading', field.heading,
          'paragraphs', jsonb_build_array(jsonb_build_object('id', field.id || '-value', 'html', ''))
        );
        select (ordinality - 1)::integer into director_position
        from jsonb_array_elements(report_sections) with ordinality as s(value, ordinality)
        where lower(translate(btrim(value ->> 'heading'), '’‘', '''''')) = 'director''s comment'
        limit 1;
        if director_position is null then
          report_sections := report_sections || jsonb_build_array(new_section);
        else
          report_sections := jsonb_insert(report_sections, array[director_position::text], new_section);
        end if;
      end if;
      next_meta := jsonb_set(next_meta, array[existing_heading], '{"type":"manual_text"}'::jsonb);
    end loop;
    update public.reports
      set sections = report_sections, section_meta = next_meta, updated_at = now()
      where id = report_row.id
        and (sections is distinct from report_sections or reports.section_meta is distinct from next_meta);
  end loop;

  for template_row in
    select id, sections, section_meta from public.report_templates
    where reporting_period = 'end_of_term'
  loop
    template_sections := coalesce(template_row.sections, '{}'::text[]);
    next_meta := coalesce(template_row.section_meta, '{}'::jsonb);
    for field in
      select * from (values ('Teacher''s comment'), ('Specials report')) as fields(heading)
    loop
      select heading into existing_heading from unnest(template_sections) as heading
      where lower(translate(btrim(heading), '’‘', '''''')) = lower(field.heading)
      limit 1;
      if existing_heading is null then
        existing_heading := field.heading;
        template_sections := array_append(template_sections, field.heading);
      end if;
      next_meta := jsonb_set(next_meta, array[existing_heading], '{"type":"manual_text"}'::jsonb);
    end loop;
    update public.report_templates
      set sections = template_sections, section_meta = next_meta
      where id = template_row.id
        and (sections is distinct from template_sections or report_templates.section_meta is distinct from next_meta);
  end loop;
end;
$$;
