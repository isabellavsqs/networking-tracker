-- Networking Tracker: contacts table, constraints, and Row Level Security.
-- Run once against your Neon project (SQL editor or `psql "$DATABASE_URL" -f db/schema.sql`)
-- after Managed Better Auth and the Data API are enabled, so the `auth` schema
-- and `authenticated` role already exist.

create extension if not exists pgcrypto;

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default auth.user_id(),
  name text not null,
  company text,
  role text,
  met_where text,
  notes text,
  priority text not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_name_not_blank check (btrim(name) <> ''),
  constraint contacts_priority_valid check (priority in ('high', 'medium', 'low'))
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists contacts_set_updated_at on contacts;
create trigger contacts_set_updated_at
before update on contacts
for each row execute function set_updated_at();

alter table contacts enable row level security;

drop policy if exists contacts_select on contacts;
create policy contacts_select on contacts for select to authenticated
  using ((select auth.user_id()) = user_id);

drop policy if exists contacts_insert on contacts;
create policy contacts_insert on contacts for insert to authenticated
  with check ((select auth.user_id()) = user_id);

drop policy if exists contacts_update on contacts;
create policy contacts_update on contacts for update to authenticated
  using ((select auth.user_id()) = user_id)
  with check ((select auth.user_id()) = user_id);

drop policy if exists contacts_delete on contacts;
create policy contacts_delete on contacts for delete to authenticated
  using ((select auth.user_id()) = user_id);

grant select, insert, update, delete on contacts to authenticated;
