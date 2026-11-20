create or replace function public.report_content_fingerprint(doc jsonb) returns text
language sql immutable security invoker set search_path='' as $$
  select md5(jsonb_build_object(
    'student',doc->'student_id','classroom',doc->'classroom_id','type',doc->'report_type',
    'date',doc->'report_date','start',doc->'period_start','end',doc->'period_end','term',doc->'term_id',
    'title',btrim(regexp_replace(coalesce(doc->>'title',''),'\s+',' ','g')),
    'logo',doc->'template_logo_url','meta',doc->'section_meta',
    'targets',(select jsonb_agg(m[1] order by si,pi,mi)
      from jsonb_array_elements(case when jsonb_typeof(doc->'sections')='array' then doc->'sections' else '[]'::jsonb end) with ordinality as ss(s,si)
      cross join lateral jsonb_array_elements(case when jsonb_typeof(s->'paragraphs')='array' then s->'paragraphs' else '[]'::jsonb end) with ordinality as pp(p,pi)
      cross join lateral regexp_matches(coalesce(p->>'html',''), '(?:href|src)\s*=\s*["'']([^"'']+)["'']','gi') with ordinality as mm(m,mi)),
    'sections',coalesce((select jsonb_agg(jsonb_build_object('heading',section->>'heading','paragraphs',
      (select jsonb_agg(btrim(regexp_replace(case when p->>'html' like '__MITABLE_%' then p->>'html'
        else regexp_replace(coalesce(p->>'html',''),'<[^>]*>','','g') end,'\s+',' ','g')) order by pi)
       from jsonb_array_elements(case when jsonb_typeof(section->'paragraphs')='array' then section->'paragraphs' else '[]'::jsonb end) with ordinality as paragraphs(p,pi))) order by si)
      from jsonb_array_elements(case when jsonb_typeof(doc->'sections')='array' then doc->'sections' else '[]'::jsonb end) with ordinality as sections(section,si)), '[]'::jsonb),
    'body',case when jsonb_array_length(case when jsonb_typeof(doc->'sections')='array' then doc->'sections' else '[]'::jsonb end)=0 then doc->>'body' else null end
  )::text);
$$;
revoke all on function public.report_content_fingerprint(jsonb) from public,anon,authenticated;
grant execute on function public.report_content_fingerprint(jsonb) to service_role;

update public.report_publications set content_hash=public.report_content_fingerprint(snapshot);
