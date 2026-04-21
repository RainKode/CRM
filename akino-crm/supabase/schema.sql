-- =====================================================================
-- Akino CRM — Database Schema (Phase 1 + Multi-Company)
-- Target: Supabase (Postgres 15+)
-- Run this in the Supabase SQL editor after creating a new project.
-- =====================================================================

-- Extensions --------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- =====================================================================
-- 1. Profiles (extends auth.users)
-- =====================================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================================
-- 1b. Companies
-- =====================================================================
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists company_members (
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  is_default boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index if not exists idx_company_members_user on company_members(user_id);

-- =====================================================================
-- 2. Folders
-- =====================================================================
create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  description text,
  is_archived boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_folders_company on folders(company_id);
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
  completed_at timestamptz,
  sort_by_field text,
  filter_by_field text
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
create table if not exists pipelines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  description text,
  folder_id uuid references folders(id) on delete set null,
  batch_id uuid references batches(id) on delete set null,
  is_default boolean not null default false,
  is_archived boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pipelines_company on pipelines(company_id);

create table if not exists pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines(id) on delete cascade,
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
  company_id uuid references companies(id) on delete cascade,
  label text not null,
  position integer not null default 0,
  is_archived boolean not null default false,
  unique (company_id, label)
);

create index if not exists idx_loss_reasons_company on loss_reasons(company_id);

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,  -- source lead
  source_folder_id uuid references folders(id) on delete set null,
  stage_id uuid not null references pipeline_stages(id),
  owner_id uuid references profiles(id) on delete set null,
  contact_name text not null,
  company text,
  email text,
  phone text,
  linkedin_url text,
  website text,
  decision_maker text,
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

create index if not exists idx_deals_company on deals(company_id);
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
  foreach tbl in array array['companies','folders','leads','deals','profiles','pipelines'] loop
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
alter table companies enable row level security;
alter table company_members enable row level security;
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

-- Security-definer helpers to derive company_id from parent FK
create or replace function public.get_folder_company(p_folder_id uuid)
returns uuid language sql stable security definer as $$
  select company_id from folders where id = p_folder_id;
$$;

create or replace function public.get_pipeline_company(p_pipeline_id uuid)
returns uuid language sql stable security definer as $$
  select company_id from pipelines where id = p_pipeline_id;
$$;

create or replace function public.get_deal_company(p_deal_id uuid)
returns uuid language sql stable security definer as $$
  select company_id from deals where id = p_deal_id;
$$;

create or replace function public.get_batch_company(p_batch_id uuid)
returns uuid language sql stable security definer as $$
  select f.company_id
  from batches b join folders f on f.id = b.folder_id
  where b.id = p_batch_id;
$$;

-- Company-scoped RLS: tables with direct company_id
create policy folders_company_rls on folders for all
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

create policy pipelines_company_rls on pipelines for all
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

create policy deals_company_rls on deals for all
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

create policy loss_reasons_company_rls on loss_reasons for all
  using (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

-- Company-scoped RLS: tables scoped via folder_id
create policy field_definitions_company_rls on field_definitions for all
  using (public.is_member_of_company(public.get_folder_company(folder_id)))
  with check (public.is_member_of_company(public.get_folder_company(folder_id)));

create policy leads_company_rls on leads for all
  using (public.is_member_of_company(public.get_folder_company(folder_id)))
  with check (public.is_member_of_company(public.get_folder_company(folder_id)));

create policy batches_company_rls on batches for all
  using (public.is_member_of_company(public.get_folder_company(folder_id)))
  with check (public.is_member_of_company(public.get_folder_company(folder_id)));

create policy import_history_company_rls on import_history for all
  using (public.is_member_of_company(public.get_folder_company(folder_id)))
  with check (public.is_member_of_company(public.get_folder_company(folder_id)));

-- Company-scoped RLS: tables scoped via batch_id → folder → company
create policy batch_leads_company_rls on batch_leads for all
  using (public.is_member_of_company(public.get_batch_company(batch_id)))
  with check (public.is_member_of_company(public.get_batch_company(batch_id)));

-- Company-scoped RLS: tables scoped via pipeline_id
create policy pipeline_stages_company_rls on pipeline_stages for all
  using (public.is_member_of_company(public.get_pipeline_company(pipeline_id)))
  with check (public.is_member_of_company(public.get_pipeline_company(pipeline_id)));

-- Company-scoped RLS: tables scoped via deal_id
create policy deal_stage_history_company_rls on deal_stage_history for all
  using (public.is_member_of_company(public.get_deal_company(deal_id)))
  with check (public.is_member_of_company(public.get_deal_company(deal_id)));

create policy activities_company_rls on activities for all
  using (public.is_member_of_company(public.get_deal_company(deal_id)))
  with check (public.is_member_of_company(public.get_deal_company(deal_id)));

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

-- Security-definer helpers to avoid RLS recursion on company_members
create or replace function public.is_member_of_company(p_company_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from company_members
    where company_id = p_company_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_admin_of_company(p_company_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from company_members
    where company_id = p_company_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

-- Companies: users see companies they belong to
create policy companies_member_read on companies for select
  using (public.is_member_of_company(id));
create policy companies_insert on companies for insert
  with check (public.is_active_member());
create policy companies_update on companies for update
  using (public.is_admin_of_company(id));

-- Company members: users see members of companies they belong to
create policy company_members_read on company_members for select
  using (public.is_member_of_company(company_id));
create policy company_members_manage on company_members for all
  using (public.is_admin_of_company(company_id));
create policy company_members_self_update on company_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy company_members_self_insert on company_members for insert
  with check (user_id = auth.uid());
