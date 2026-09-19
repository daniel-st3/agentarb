create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forge_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  title text not null check (char_length(title) between 1 and 200),
  objective text not null check (char_length(objective) between 12 and 2000),
  decision text not null check (decision in (
    'conditionally_profitable', 'conditionally_marginal',
    'conditionally_uneconomic', 'insufficient_data', 'unroutable'
  )),
  request_payload jsonb not null,
  result_payload jsonb not null,
  receipt_hash text not null check (receipt_hash ~ '^[a-f0-9]{64}$'),
  receipt_schema_version text not null,
  economic_model_version text not null,
  policy_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists forge_runs_user_created_idx
  on public.forge_runs (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.forge_runs enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "forge_runs_select_own" on public.forge_runs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "forge_runs_insert_own" on public.forge_runs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "forge_runs_update_own" on public.forge_runs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "forge_runs_delete_own" on public.forge_runs
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger forge_runs_set_updated_at
before update on public.forge_runs
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 80), ''),
    nullif(left(coalesce(new.raw_user_meta_data ->> 'avatar_url', ''), 2048), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

revoke all on table public.profiles from anon;
revoke all on table public.forge_runs from anon;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.forge_runs to authenticated;
