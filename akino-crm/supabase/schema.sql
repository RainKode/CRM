-- =====================================================================
-- Akino CRM — Database Schema (Phase 1)
-- Target: Supabase (Postgres 15+)
-- Run this in the Supabase SQL editor after creating a new project.
-- =====================================================================

-- Extensions --------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- =====================================================================
-- 1. Profiles (extends auth.users)
-- =====================================================================
create type user_role as enum ('admin', 'sales_rep', 'viewer');

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role user_role not null default 'sales_rep',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on profiles(role);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  first_user boolean;
begin
  select not exists(select 1 from profiles) into first_user;
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    case when first_user then 'admin'::user_role else 'sales_rep'::user_role end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================================
-- 2. Folders
-- =====================================================================
create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_archived boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_folders_archived on folders(is_archived);
create index if not exists idx_folders_name_trgm on folders using gin (name gin_trgm_ops);

-- =====================================================================
-- 3. Field definitions (column schema per folder)
-- =====================================================================
create type field_type as enum (
  'text', 'number', 'email', 'phone', 'url', 'date',
  'dropdown', 'checkbox', 'multiselect'
);

create table if not exists field_definitions (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references folders(id) on delete cascade,
  key text not null,                       -- stable key used in leads.data jsonb
  label text not null,                     -- display name
  type field_type not null,
  options jsonb,                           -- for dropdown/multiselect: ["Agency","SaaS",...]
  is_required boolean not null default false,
  is_hidden boolean not null default false,
  is_enrichment boolean not null default false, -- appears in enrichment form
  description text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (folder_id, key)
);

create index if not exists idx_field_defs_folder on field_definitions(folder_id, position);

-- =====================================================================
-- 4. Leads (dynamic schema via data jsonb)
-- =====================================================================
create type lead_status as enum ('raw', 'enriched', 'in_pipeline', 'archived');

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references folders(id) on delete cascade,
  email text,                              -- surfaced for de-dup + fast lookup
  name text,                               -- surfaced for list displays
  company text,                            -- surfaced for list displays
  data jsonb not null default '{}'::jsonb, -- dynamic fields keyed by field_definitions.key
  status lead_status not null default 'raw',
  tags text[] not null default '{}',
  notes text,
  enriched_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_folder on leads(folder_id);
create index if not exists idx_leads_status on leads(folder_id, status);
create unique index if not exists uniq_leads_folder_email
  on leads(folder_id, lower(email)) where email is not null;
create index if not exists idx_leads_data on leads using gin (data jsonb_path_ops);
create index if not exists idx_leads_tags on leads using gin (tags);
create index if not exists idx_leads_search_trgm on leads using gin (
  (coalesce(name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(company,'')) gin_trgm_ops
);

-- =====================================================================
-- 5. Enrichment batches
-- =====================================================================
create type batch_status as enum ('not_started', 'in_progress', 'complete');

create table if not exists batches (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references folders(id) on delete cascade,
  name text not null,
  description text,
  assignee_id uuid references profiles(id) on delete set null,
  status batch_status not null default 'not_started',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_batches_folder on batches(folder_id);
create index if not exists idx_batches_assignee on batches(assignee_id);

create table if not exists batch_leads (
  batch_id uuid not null references batches(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  is_completed boolean not null default false,
  is_skipped boolean not null default false,
  is_flagged boolean not null default false,
  flag_reason text,
  completed_at timestamptz,
  completed_by uuid references profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (batch_id, lead_id)
);

-- A lead may be in at most one active (non-complete) batch at a time.
create unique index if not exists uniq_lead_active_batch
  on batch_leads(lead_id)
  where is_completed = false;

create index if not exists idx_batch_leads_batch on batch_leads(batch_id);
create index if not exists idx_batch_leads_lead on batch_leads(lead_id);

-- =====================================================================
-- 6. Pipeline
-- =====================================================================
create table if not exists pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position integer not null,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_pipeline_stage_position
  on pipeline_stages(pipeline_id, position) where is_archived = false;

create table if not exists loss_reasons (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  position integer not null default 0,
  is_archived boolean not null default false
);

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,  -- source lead
  source_folder_id uuid references folders(id) on delete set null,
  stage_id uuid not null references pipeline_stages(id),
  owner_id uuid references profiles(id) on delete set null,
  contact_name text not null,
  company text,
  email text,
  phone text,
  linkedin_url text,
  deal_value numeric(14,2),                -- optional (P2)
  currency text default 'GBP',
  notes text,
  follow_up_at timestamptz,
  follow_up_note text,
  last_activity_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  loss_reason_id uuid references loss_reasons(id),
  stage_entered_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deals_stage on deals(stage_id);
create index if not exists idx_deals_owner on deals(owner_id);
create index if not exists idx_deals_follow_up on deals(follow_up_at)
  where follow_up_at is not null;
create index if not exists idx_deals_last_activity on deals(last_activity_at);
create unique index if not exists uniq_deal_active_lead
  on deals(lead_id)
  where lead_id is not null and won_at is null and lost_at is null;

-- Per-stage timestamp history
create table if not exists deal_stage_history (
  id bigserial primary key,
  deal_id uuid not null references deals(id) on delete cascade,
  from_stage_id uuid references pipeline_stages(id),
  to_stage_id uuid not null references pipeline_stages(id),
  changed_by uuid references profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_deal_stage_history_deal on deal_stage_history(deal_id);

-- =====================================================================
-- 7. Activities (calls, emails, notes, stage changes)
-- =====================================================================
create type activity_type as enum (
  'call', 'email', 'note', 'stage_change', 'follow_up_set', 'won', 'lost'
);

create type call_direction as enum ('inbound', 'outbound');

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  type activity_type not null,
  summary text,
  notes text,
  -- Call-specific
  call_direction call_direction,
  call_duration_seconds integer,
  call_outcome text,
  -- Email-specific
  email_subject text,
  -- Stage-change-specific (free text snapshot of stage names)
  stage_from text,
  stage_to text,
  -- Meta
  occurred_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_activities_deal on activities(deal_id, occurred_at desc);
create index if not exists idx_activities_type on activities(type);

-- Keep deals.last_activity_at fresh
create or replace function public.bump_deal_activity()
returns trigger language plpgsql as $$
begin
  update deals set last_activity_at = new.occurred_at, updated_at = now()
  where id = new.deal_id;
  return new;
end;
$$;

drop trigger if exists trg_bump_deal_activity on activities;
create trigger trg_bump_deal_activity
  after insert on activities
  for each row execute procedure public.bump_deal_activity();

-- =====================================================================
-- 8. CSV import history
-- =====================================================================
create table if not exists import_history (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references folders(id) on delete cascade,
  filename text not null,
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  error_rows integer not null default 0,
  error_report jsonb,
  status text not null default 'processing', -- processing | complete | failed
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_import_history_folder on import_history(folder_id, created_at desc);

-- =====================================================================
-- 9. Notifications
-- =====================================================================
create type notification_type as enum (
  'follow_up_due', 'follow_up_overdue', 'batch_assigned', 'import_complete', 'import_failed'
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type notification_type not null,
  title text not null,
  body text,
  link text,                               -- in-app deep link
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on notifications(user_id, is_read, created_at desc);

-- =====================================================================
-- 10. Updated-at triggers
-- =====================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare tbl text;
begin
  foreach tbl in array array['folders','leads','deals','profiles'] loop
    execute format(
      'drop trigger if exists trg_touch_%1$s on %1$s;
       create trigger trg_touch_%1$s before update on %1$s
       for each row execute procedure public.touch_updated_at();', tbl);
  end loop;
end $$;

-- =====================================================================
-- 11. Seed: default pipeline stages + loss reasons
-- =====================================================================
insert into pipeline_stages (name, position, is_won, is_lost)
values
  ('New', 0, false, false),
  ('Contacted', 1, false, false),
  ('Responded', 2, false, false),
  ('Meeting Booked', 3, false, false),
  ('Proposal Sent', 4, false, false),
  ('Negotiation', 5, false, false),
  ('Won', 6, true, false),
  ('Lost', 7, false, true)
on conflict do nothing;

insert into loss_reasons (label, position)
values
  ('No Response', 0),
  ('Budget', 1),
  ('Wrong Contact', 2),
  ('Went with Competitor', 3),
  ('Not Interested', 4),
  ('Other', 5)
on conflict do nothing;

-- =====================================================================
-- 12. Row Level Security (single-org model)
-- =====================================================================
-- Every signed-in user with an active profile can access data; role checks
-- are enforced in app code (server actions). This keeps the schema simple
-- while still blocking anonymous access.

alter table profiles enable row level security;
alter table folders enable row level security;
alter table field_definitions enable row level security;
alter table leads enable row level security;
alter table batches enable row level security;
alter table batch_leads enable row level security;
alter table pipeline_stages enable row level security;
alter table loss_reasons enable row level security;
alter table deals enable row level security;
alter table deal_stage_history enable row level security;
alter table activities enable row level security;
alter table import_history enable row level security;
alter table notifications enable row level security;

create or replace function public.is_active_member()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and is_active = true
  );
$$;

-- Helper to avoid repeating the policy block per table
do $$
declare t text;
begin
  foreach t in array array[
    'folders','field_definitions','leads','batches','batch_leads',
    'pipeline_stages','loss_reasons','deals','deal_stage_history',
    'activities','import_history'
  ] loop
    execute format('drop policy if exists %1$s_member_all on %1$s;', t);
    execute format(
      'create policy %1$s_member_all on %1$s for all
       using (public.is_active_member()) with check (public.is_active_member());', t);
  end loop;
end $$;

-- Profiles: everyone can read all profiles; users update only themselves.
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select using (public.is_active_member());

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Notifications: each user sees and updates only their own.
drop policy if exists notifications_own on notifications;
create policy notifications_own on notifications for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
