create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (
    char_length(name) between 1 and 120
    and name = btrim(name, E' \t\n\r\f\v' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
    and name !~ '^[[:space:]]*$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (
    char_length(title) between 1 and 200
    and title = btrim(title, E' \t\n\r\f\v' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
    and title !~ '^[[:space:]]*$'
  ),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_created_idx on public.projects (owner_id, created_at desc, id desc);
create index tasks_project_created_idx on public.tasks (project_id, created_at desc, id desc);
create index tasks_status_idx on public.tasks (status);

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_updated_at before update on public.projects
for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks
for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.tasks enable row level security;

revoke all on public.projects, public.tasks from anon, authenticated;
grant select, insert, update, delete on public.projects, public.tasks to authenticated;
revoke execute on function public.set_updated_at() from public;

create policy projects_select on public.projects for select to authenticated
using ((select auth.uid()) = owner_id);
create policy projects_insert on public.projects for insert to authenticated
with check ((select auth.uid()) = owner_id);
create policy projects_update on public.projects for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
create policy projects_delete on public.projects for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy tasks_select on public.tasks for select to authenticated
using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy tasks_insert on public.tasks for insert to authenticated
with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy tasks_update on public.tasks for update to authenticated
using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy tasks_delete on public.tasks for delete to authenticated
using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
