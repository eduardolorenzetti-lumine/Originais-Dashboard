-- Originais Lumine
-- Endurecimento de segurança com Supabase Auth (Magic Link)
-- Execute este script no SQL Editor do projeto Supabase.

begin;

create schema if not exists private;

create table if not exists public.app_users (
  email text primary key,
  name text not null,
  role text not null check (role in ('ADMIN', 'EDITOR', 'LEITOR')),
  active boolean not null default true,
  invited_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at
before update on public.app_users
for each row
execute function private.set_updated_at();

create or replace function private.current_user_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt()->>'email', ''))
$$;

create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(
    (
      select role
      from public.app_users
      where email = private.current_user_email()
        and active = true
      limit 1
    ),
    ''
  )
$$;

create or replace function private.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists(
    select 1
    from public.app_users
    where email = private.current_user_email()
      and active = true
  )
$$;

create or replace function private.can_manage_users()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.current_user_role() = 'ADMIN'
$$;

create or replace function private.can_edit_app()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.current_user_role() in ('ADMIN', 'EDITOR')
$$;

alter table public.app_users enable row level security;
alter table public.app_state enable row level security;

-- Backfill dos usuários já existentes no app_state.
insert into public.app_users (email, name, role, active, invited_at)
select distinct
  lower(trim(user_row->>'email')) as email,
  coalesce(nullif(trim(user_row->>'name'), ''), initcap(split_part(lower(trim(user_row->>'email')), '@', 1))) as name,
  case upper(coalesce(trim(user_row->>'role'), 'LEITOR'))
    when 'ADMIN' then 'ADMIN'
    when 'EDITOR' then 'EDITOR'
    else 'LEITOR'
  end as role,
  true as active,
  nullif(trim(user_row->>'invitedAt'), '')::timestamptz as invited_at
from public.app_state state_row
cross join lateral jsonb_array_elements(coalesce(state_row.state->'users', '[]'::jsonb)) as user_row
where nullif(lower(trim(user_row->>'email')), '') is not null
on conflict (email) do update
set
  name = excluded.name,
  role = excluded.role,
  active = true,
  invited_at = coalesce(excluded.invited_at, public.app_users.invited_at),
  updated_at = timezone('utc', now());

-- Remove hashes/sinais de senha do JSON já salvo.
update public.app_state state_row
set state = jsonb_set(
  state_row.state,
  '{users}',
  coalesce(
    (
      select jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'id', coalesce(nullif(trim(user_row->>'id'), ''), lower(trim(user_row->>'email'))),
            'name', coalesce(nullif(trim(user_row->>'name'), ''), initcap(split_part(lower(trim(user_row->>'email')), '@', 1))),
            'email', lower(trim(user_row->>'email')),
            'role',
              case upper(coalesce(trim(user_row->>'role'), 'LEITOR'))
                when 'ADMIN' then 'ADMIN'
                when 'EDITOR' then 'EDITOR'
                else 'LEITOR'
              end,
            'active', true,
            'invitedAt', nullif(trim(user_row->>'invitedAt'), '')
          )
        )
      )
      from jsonb_array_elements(coalesce(state_row.state->'users', '[]'::jsonb)) as user_row
      where nullif(lower(trim(user_row->>'email')), '') is not null
    ),
    '[]'::jsonb
  ),
  true
);

drop policy if exists "allow read app_state" on public.app_state;
drop policy if exists "allow write app_state" on public.app_state;
drop policy if exists "allow update app_state" on public.app_state;

drop policy if exists "app_state_select_allowed" on public.app_state;
create policy "app_state_select_allowed"
on public.app_state
for select
to authenticated
using (private.is_allowed_user());

drop policy if exists "app_state_insert_editors" on public.app_state;
create policy "app_state_insert_editors"
on public.app_state
for insert
to authenticated
with check (private.can_edit_app());

drop policy if exists "app_state_update_editors" on public.app_state;
create policy "app_state_update_editors"
on public.app_state
for update
to authenticated
using (private.can_edit_app())
with check (private.can_edit_app());

drop policy if exists "app_users_select_self_or_admin" on public.app_users;
create policy "app_users_select_self_or_admin"
on public.app_users
for select
to authenticated
using (
  private.can_manage_users()
  or email = private.current_user_email()
);

drop policy if exists "app_users_insert_admin" on public.app_users;
create policy "app_users_insert_admin"
on public.app_users
for insert
to authenticated
with check (private.can_manage_users());

drop policy if exists "app_users_update_admin" on public.app_users;
create policy "app_users_update_admin"
on public.app_users
for update
to authenticated
using (private.can_manage_users())
with check (private.can_manage_users());

drop policy if exists "app_users_delete_admin" on public.app_users;
create policy "app_users_delete_admin"
on public.app_users
for delete
to authenticated
using (private.can_manage_users());

commit;
