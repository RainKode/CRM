-- =====================================================================
-- Tasks + scheduled activities
-- =====================================================================
-- 1. Standalone tasks (not required to be tied to a deal/lead).
-- 2. Extend activities with a status + scheduled_at so we can represent
--    future-scheduled calls/meetings without polluting the past timeline.
-- =====================================================================

-- =====================================================================
-- 1. tasks table
-- =====================================================================
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  title text not null,
  notes text,
  due_at timestamptz,
  completed_at timestamptz,
  -- Optional links: a task may belong to a deal and/or a lead, or be standalone.
  deal_id uuid references deals(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  -- Assignment (nullable — can be unassigned).
  assigned_to uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_company_due on tasks(company_id, due_at);
create index if not exists idx_tasks_company_open
  on tasks(company_id, due_at)
  where completed_at is null;
create index if not exists idx_tasks_assignee on tasks(assigned_to) where completed_at is null;
create index if not exists idx_tasks_deal on tasks(deal_id) where deal_id is not null;
create index if not exists idx_tasks_lead on tasks(lead_id) where lead_id is not null;

-- keep updated_at fresh
create or replace function public.touch_tasks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_tasks_updated_at on tasks;
create trigger trg_touch_tasks_updated_at
  before update on tasks
  for each row execute procedure public.touch_tasks_updated_at();

alter table tasks enable row level security;

create policy tasks_company_rls on tasks for all
  using  (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

-- =====================================================================
-- 2. scheduled activities
-- =====================================================================
-- Add a `meeting` activity type and a status column so we can distinguish
-- logged past activity vs a future-scheduled one.
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'activity_type' and e.enumlabel = 'meeting'
  ) then
    alter type activity_type add value 'meeting';
  end if;
end $$;

alter table activities
  add column if not exists status text not null default 'done',
  add column if not exists scheduled_at timestamptz;

-- Partial index for the "upcoming scheduled" query on the dashboard.
create index if not exists idx_activities_scheduled
  on activities(scheduled_at)
  where status = 'scheduled';
