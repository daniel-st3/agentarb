create table public.source_synthesis_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null,
  objective text not null check (char_length(objective) between 12 and 2000),
  receipt_payload jsonb not null,
  receipt_hash text not null check (receipt_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (user_id, run_id)
);

create index source_synthesis_runs_user_created_idx
  on public.source_synthesis_runs (user_id, created_at desc);

alter table public.source_synthesis_runs enable row level security;

create policy "source_synthesis_runs_select_own" on public.source_synthesis_runs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "source_synthesis_runs_insert_own" on public.source_synthesis_runs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "source_synthesis_runs_delete_own" on public.source_synthesis_runs
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.source_synthesis_runs from anon;
revoke all on table public.source_synthesis_runs from authenticated;
grant select, insert, delete on table public.source_synthesis_runs to authenticated;
