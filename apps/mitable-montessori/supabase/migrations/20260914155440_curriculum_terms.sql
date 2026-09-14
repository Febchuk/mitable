-- A curriculum may belong to one school term. The composite reference
-- keeps the term and curriculum in the same school, while allowing a term to
-- be removed without removing its curricula.
alter table public.curricula
  add column term_id uuid;

alter table public.school_terms
  add constraint school_terms_school_id_id_key unique (school_id, id);

alter table public.curricula
  add constraint curricula_school_term_id_fkey
  foreign key (school_id, term_id)
  references public.school_terms (school_id, id)
  on delete set null (term_id);

create index curricula_school_id_term_id_idx
  on public.curricula (school_id, term_id);
