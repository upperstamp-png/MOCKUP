-- Requires the King Sports portal schema and its membership policies.
create function public.university_role() returns text language sql stable security definer
set search_path = '' as $$
  select case when portal.current_user_is_network_admin() then 'admin'
    when exists (
      select 1 from portal.unit_memberships m
      join portal.profiles p on p.id=m.user_id
      join portal.roles_permissions r on r.role_slug=m.role_slug
      where m.user_id=auth.uid() and m.status='active' and p.is_active
        and r.permissions ? 'training:read'
    ) then 'student' end
$$;
revoke all on function public.university_role() from public;
grant execute on function public.university_role() to authenticated;

create table public.university_tracks (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]+$' and slug <> 'gestao'),
  title text not null, short_title text not null, description text not null,
  objectives text not null default '', audience text not null default '',
  cover_url text, focal_x integer not null default 50 check (focal_x between 0 and 100),
  focal_y integer not null default 50 check (focal_y between 0 and 100),
  position integer not null default 0, required boolean not null default true,
  state text not null default 'draft' check (state in ('draft','review','published','archived')),
  updated_by uuid references auth.users on delete set null
);
create table public.university_modules (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.university_tracks on delete restrict,
  title text not null, position integer not null default 0
);
create index university_modules_track on public.university_modules(track_id, position);
create table public.university_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.university_modules on delete restrict,
  title text not null, body text not null default '', position integer not null default 0,
  kind text not null check (kind in ('text','video','pdf','link','live')),
  asset_path text, external_url text, duration_seconds integer check (duration_seconds > 0),
  state text not null default 'draft' check (state in ('draft','review','published','archived')),
  updated_by uuid references auth.users on delete set null,
  check (state <> 'published' or
    (kind = 'text' and length(trim(body)) > 0) or
    (kind in ('video','pdf') and asset_path is not null) or
    (kind in ('link','live') and external_url is not null and external_url ~ '^https://[^[:space:]]+$'))
);
create index university_lessons_module on public.university_lessons(module_id, position);
create table public.university_progress (
  user_id uuid not null references portal.profiles on delete cascade,
  lesson_id uuid not null references public.university_lessons on delete restrict,
  last_access timestamptz not null default now(),
  position_seconds integer not null default 0 check (position_seconds between 0 and 86400),
  completed_at timestamptz,
  notes text not null default '' check (length(notes) <= 10000),
  primary key (user_id, lesson_id)
);
create index university_progress_resume on public.university_progress(user_id, last_access desc);

alter table public.university_tracks enable row level security;
alter table public.university_modules enable row level security;
alter table public.university_lessons enable row level security;
alter table public.university_progress enable row level security;
create policy university_tracks_read on public.university_tracks for select to authenticated
  using (public.university_role() = 'admin' or (public.university_role() = 'student' and state = 'published'));
create policy university_modules_read on public.university_modules for select to authenticated
  using (exists (select 1 from public.university_tracks t where t.id = track_id));
create policy university_lessons_read on public.university_lessons for select to authenticated
  using (public.university_role() = 'admin' or (state = 'published' and exists (select 1 from public.university_modules m where m.id = module_id)));
create policy university_tracks_admin on public.university_tracks for all to authenticated
  using (public.university_role() = 'admin') with check (public.university_role() = 'admin');
create policy university_modules_admin on public.university_modules for all to authenticated
  using (public.university_role() = 'admin') with check (public.university_role() = 'admin');
create policy university_lessons_admin on public.university_lessons for all to authenticated
  using (public.university_role() = 'admin') with check (public.university_role() = 'admin');
create policy university_progress_self on public.university_progress for select to authenticated
  using (user_id = auth.uid() and public.university_role() is not null);
revoke all on public.university_tracks, public.university_modules, public.university_lessons, public.university_progress from anon, authenticated;
grant select on public.university_progress to authenticated;
grant select, insert, update on public.university_tracks, public.university_modules, public.university_lessons to authenticated;

insert into storage.buckets(id,name,public) values ('university-private','university-private',false)
on conflict (id) do nothing;
create policy university_files_read on storage.objects for select to authenticated
  using (bucket_id='university-private' and (
    public.university_role()='admin' or exists (
      select 1 from public.university_lessons l where l.asset_path=name and l.state='published'
    )
  ));
create policy university_files_create on storage.objects for insert to authenticated
  with check (bucket_id='university-private' and public.university_role()='admin');

insert into public.university_tracks(slug, short_title, title, description, position) values
 ('institucional','Comece por aqui','Institucional, cultura e rotina','Conheça a operação, os canais e as responsabilidades da unidade.',1),
 ('vendas','Vendas e CRM','Comercial, vendas e CRM','Da prospecção ao acompanhamento comercial.',2),
 ('produtos','Produtos e mockups','Produtos, malhas e mockups','Modelagens, tecidos e apresentação de uniformes.',3),
 ('arte','Arte e design','Arte, design e preparação de arquivos','Briefing, aprovação e preparação técnica.',4),
 ('pedidos','Pedidos e produção','Operação, PCP e fábrica','Conferência, produção e entrega.',5),
 ('financeiro','Financeiro','Financeiro e operação comercial','Precificação, recebimentos e conciliação.',6),
 ('marca','Marca e pós-venda','Marca, jurídico e pós-venda','Identidade, atendimento e ocorrências.',7);

create table public.university_activities (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid unique not null references public.university_lessons on delete restrict,
  instructions text not null check (length(trim(instructions)) > 0),
  criteria text not null default '',
  due_at timestamptz,
  required boolean not null default true
);
create table public.university_submissions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.university_activities on delete restrict,
  user_id uuid not null default auth.uid() references portal.profiles on delete cascade,
  response text not null check (length(trim(response)) between 1 and 10000),
  state text not null default 'submitted' check (state in ('submitted','reviewing','changes','approved','failed')),
  feedback text,
  reviewed_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index university_submissions_activity on public.university_submissions(activity_id,user_id,created_at desc);
create unique index university_submissions_pending on public.university_submissions(activity_id,user_id) where state in ('submitted','reviewing');

alter table public.university_activities enable row level security;
alter table public.university_submissions enable row level security;
create policy university_activity_read on public.university_activities for select to authenticated
  using (exists (select 1 from public.university_lessons l where l.id=lesson_id));
create policy university_activity_admin on public.university_activities for all to authenticated
  using (public.university_role()='admin') with check (public.university_role()='admin');
create policy university_submission_read on public.university_submissions for select to authenticated
  using (public.university_role()='admin' or (public.university_role()='student' and user_id=auth.uid()));
create policy university_submission_create on public.university_submissions for insert to authenticated
  with check (public.university_role()='student' and user_id=auth.uid() and exists (
    select 1 from public.university_activities a where a.id=activity_id and (a.due_at is null or now() <= a.due_at)
  ));
create policy university_submission_review on public.university_submissions for update to authenticated
  using (public.university_role()='admin') with check (public.university_role()='admin' and reviewed_by=auth.uid());
revoke all on public.university_activities, public.university_submissions from anon, authenticated;
grant select, insert, update on public.university_activities to authenticated;
grant select, insert(activity_id,response), update(state,feedback,reviewed_by) on public.university_submissions to authenticated;

create function public.university_save_progress(p_lesson uuid, p_position integer default null, p_notes text default null, p_complete boolean default false)
returns public.university_progress language plpgsql security definer set search_path = '' as $$
declare saved public.university_progress;
begin
  if public.university_role() is null or not exists (
    select 1 from public.university_lessons l
    join public.university_modules m on m.id=l.module_id
    join public.university_tracks t on t.id=m.track_id
    where l.id=p_lesson and l.state='published' and t.state='published'
  ) then raise exception 'Aula indisponível' using errcode='42501'; end if;
  if p_complete and exists (
    select 1 from public.university_activities a where a.lesson_id=p_lesson and a.required
      and not exists (select 1 from public.university_submissions s where s.activity_id=a.id and s.user_id=auth.uid() and s.state='approved')
  ) then raise exception 'A atividade obrigatória precisa de aprovação' using errcode='42501'; end if;
  insert into public.university_progress as p(user_id,lesson_id,position_seconds,notes,completed_at)
  values(auth.uid(),p_lesson,coalesce(p_position,0),coalesce(p_notes,''),case when p_complete then now() end)
  on conflict(user_id,lesson_id) do update set
    last_access=now(), position_seconds=coalesce(p_position,p.position_seconds),
    notes=coalesce(p_notes,p.notes), completed_at=coalesce(p.completed_at,excluded.completed_at)
  returning * into saved;
  return saved;
end $$;
revoke all on function public.university_save_progress(uuid,integer,text,boolean) from public;
grant execute on function public.university_save_progress(uuid,integer,text,boolean) to authenticated;


create function public.university_banca_status()
returns table(status text, evaluated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.status, e.evaluated_at from portal.banca_evaluations e
  join portal.unit_memberships m on m.user_id=e.user_id and m.unit_id=e.unit_id
  where e.user_id=auth.uid() and m.status='active' and public.university_role() is not null
  order by e.created_at desc limit 1
$$;
revoke all on function public.university_banca_status() from public;
grant execute on function public.university_banca_status() to authenticated;

create table public.university_editorial_history (
  id bigint generated always as identity primary key,
  entity text not null,
  entity_id uuid not null,
  actor uuid references auth.users on delete set null,
  changed_at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb not null
);
alter table public.university_editorial_history enable row level security;
revoke all on public.university_editorial_history from anon, authenticated;
grant select on public.university_editorial_history to authenticated;
create policy university_audit_admin on public.university_editorial_history for select to authenticated using (public.university_role()='admin');
create function public.university_record_edit() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.university_editorial_history(entity,entity_id,actor,before_data,after_data)
  values (tg_table_name,new.id,auth.uid(),case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));
  return new;
end $$;
revoke all on function public.university_record_edit() from public;
create trigger university_track_history after insert or update on public.university_tracks for each row execute function public.university_record_edit();
create trigger university_module_history after insert or update on public.university_modules for each row execute function public.university_record_edit();
create trigger university_lesson_history after insert or update on public.university_lessons for each row execute function public.university_record_edit();
create trigger university_activity_history after insert or update on public.university_activities for each row execute function public.university_record_edit();
