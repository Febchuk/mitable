-- Writing style (LLM tone) + optional logo URL for printed/report UI.
-- Public storage bucket for template logos; uploads use service role server-side.

alter table report_templates
  add column if not exists writing_style text not null default '';

alter table report_templates
  add column if not exists logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-template-logos',
  'report-template-logos',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists "report_template_logos_public_read" on storage.objects;

create policy "report_template_logos_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'report-template-logos');
