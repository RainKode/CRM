-- =====================================================================
-- Phase 3 — Unipile Email Integration (Milestone A: plumbing)
-- Tables, indexes, RLS, triggers for email accounts / threads / messages
-- plus extensions to activities + deals for email state.
-- =====================================================================

-- =====================================================================
-- 1. email_accounts (one row per connected provider account)
-- =====================================================================
create table if not exists email_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  provider text not null,                       -- 'gmail' | 'outlook' | 'imap'
  email_address text not null,
  unipile_account_id text not null unique,
  status text not null default 'connected',     -- 'connected' | 'disconnected' | 'error'
  last_sync_at timestamptz,
  sync_state text not null default 'idle',      -- 'idle' | 'backfilling' | 'error'
  sync_progress int not null default 0,         -- 0..100
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_accounts_company on email_accounts(company_id);
create index if not exists idx_email_accounts_user on email_accounts(user_id);
create unique index if not exists uniq_email_accounts_user_email
  on email_accounts(user_id, lower(email_address));

-- =====================================================================
-- 2. email_threads (conversation = subject + participants)
-- =====================================================================
create table if not exists email_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  account_id uuid references email_accounts(id) on delete set null,
  deal_id uuid references deals(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  subject text,
  participants text[] not null default '{}',    -- normalized lowercase emails
  unipile_thread_id text,                       -- provider-normalized thread id
  last_message_at timestamptz,
  last_message_snippet text,
  message_count int not null default 0,
  unread_count int not null default 0,
  is_waiting_on_them boolean not null default false,
  awaiting_since timestamptz,
  status text not null default 'open',          -- 'open' | 'snoozed' | 'done' | 'archived'
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_threads_company on email_threads(company_id, last_message_at desc);
create index if not exists idx_email_threads_deal on email_threads(deal_id) where deal_id is not null;
create index if not exists idx_email_threads_lead on email_threads(lead_id) where lead_id is not null;
create index if not exists idx_email_threads_account on email_threads(account_id);
create index if not exists idx_email_threads_unread
  on email_threads(company_id) where unread_count > 0;
create index if not exists idx_email_threads_unassigned
  on email_threads(company_id, last_message_at desc) where deal_id is null;
create unique index if not exists uniq_email_threads_unipile
  on email_threads(account_id, unipile_thread_id)
  where unipile_thread_id is not null;
create index if not exists idx_email_threads_participants on email_threads using gin (participants);

-- =====================================================================
-- 3. email_messages (every send + receive)
-- =====================================================================
create table if not exists email_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  thread_id uuid not null references email_threads(id) on delete cascade,
  account_id uuid references email_accounts(id) on delete set null,
  unipile_message_id text not null unique,
  direction text not null,                      -- 'outbound' | 'inbound'
  from_address text,
  from_name text,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  bcc_addresses text[] not null default '{}',
  subject text,
  snippet text,
  body_text text,
  body_html text,
  sent_at timestamptz,
  received_at timestamptz,
  sent_by_user_id uuid references profiles(id) on delete set null,
  sent_from_account_id uuid references email_accounts(id) on delete set null,
  in_reply_to text,
  references_header text,
  message_id_header text,
  has_attachments boolean not null default false,
  is_read boolean not null default false,
  -- tracking
  opens int not null default 0,
  first_opened_at timestamptz,
  clicks int not null default 0,
  first_clicked_at timestamptz,
  -- template + scheduled
  template_id uuid,                             -- fk added after templates table (future)
  scheduled_send_at timestamptz,
  status text not null default 'sent',          -- 'sent' | 'scheduled' | 'failed' | 'draft'
  send_error text,
  -- raw for debugging / reprocess
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_messages_thread on email_messages(thread_id, sent_at desc nulls last, received_at desc nulls last);
create index if not exists idx_email_messages_company on email_messages(company_id);
create index if not exists idx_email_messages_message_id_header on email_messages(message_id_header) where message_id_header is not null;
create index if not exists idx_email_messages_scheduled on email_messages(scheduled_send_at) where status = 'scheduled';
create index if not exists idx_email_messages_direction on email_messages(company_id, direction);

-- =====================================================================
-- 4. email_attachments
-- =====================================================================
create table if not exists email_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references email_messages(id) on delete cascade,
  filename text,
  content_type text,
  size_bytes int,
  unipile_attachment_id text,
  storage_path text,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_attachments_message on email_attachments(message_id);

-- =====================================================================
-- 5. email_tracking_events
-- =====================================================================
create table if not exists email_tracking_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references email_messages(id) on delete cascade,
  event text not null,                          -- 'open' | 'click'
  url text,
  user_agent text,
  ip inet,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_email_tracking_message on email_tracking_events(message_id, occurred_at desc);

-- =====================================================================
-- 6. email_templates
-- =====================================================================
create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  folder_id uuid references folders(id) on delete set null,
  name text not null,
  subject text not null,
  body_html text not null,
  variables text[] not null default '{}',
  created_by uuid references profiles(id) on delete set null,
  is_shared boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_templates_company on email_templates(company_id);

-- Add the deferred FK from email_messages.template_id now that templates exist
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'email_messages_template_id_fkey'
  ) then
    alter table email_messages
      add constraint email_messages_template_id_fkey
      foreign key (template_id) references email_templates(id) on delete set null;
  end if;
end $$;

-- =====================================================================
-- 7. email_sequences + steps + enrollments
-- =====================================================================
create table if not exists email_sequences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_sequences_company on email_sequences(company_id);

create table if not exists email_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references email_sequences(id) on delete cascade,
  position int not null,
  wait_days int not null default 0,
  template_id uuid not null references email_templates(id) on delete restrict,
  condition text not null default 'always',    -- 'always' | 'no_reply' | 'no_open'
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_email_sequence_steps_pos
  on email_sequence_steps(sequence_id, position);
create index if not exists idx_email_sequence_steps_sequence on email_sequence_steps(sequence_id);

create table if not exists email_sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references email_sequences(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  current_step int not null default 0,
  next_send_at timestamptz,
  status text not null default 'active',        -- 'active' | 'paused' | 'completed' | 'replied' | 'bounced'
  enrolled_by uuid references profiles(id) on delete set null,
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_seq_enrollment_active
  on email_sequence_enrollments(sequence_id, deal_id)
  where status in ('active','paused');
create index if not exists idx_seq_enrollments_due
  on email_sequence_enrollments(next_send_at)
  where status = 'active' and next_send_at is not null;

-- =====================================================================
-- 8. Extensions to activities + deals
-- =====================================================================
alter table activities
  add column if not exists email_message_id uuid references email_messages(id) on delete set null;

create index if not exists idx_activities_email_message
  on activities(email_message_id) where email_message_id is not null;

-- Add 'email_received' + 'email_sent' to activity_type enum (distinct from generic 'email')
do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid
                 where t.typname='activity_type' and e.enumlabel='email_received') then
    alter type activity_type add value 'email_received';
  end if;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid
                 where t.typname='activity_type' and e.enumlabel='email_sent') then
    alter type activity_type add value 'email_sent';
  end if;
end $$;

alter table deals
  add column if not exists email_status text not null default 'no_contact',
                                                -- 'no_contact' | 'awaiting_reply' | 'replied' | 'stale'
  add column if not exists last_inbound_at timestamptz,
  add column if not exists last_outbound_at timestamptz,
  add column if not exists auto_advance_on_reply boolean not null default false;

create index if not exists idx_deals_email_status on deals(company_id, email_status);
create index if not exists idx_deals_awaiting
  on deals(company_id, last_outbound_at)
  where email_status = 'awaiting_reply';

-- =====================================================================
-- 9. touch updated_at triggers for new tables
-- =====================================================================
create or replace function public.touch_email_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'email_accounts','email_threads','email_templates',
    'email_sequences','email_sequence_enrollments'
  ] loop
    execute format(
      'drop trigger if exists trg_touch_%1$s on %1$s;
       create trigger trg_touch_%1$s before update on %1$s
       for each row execute procedure public.touch_email_updated_at();', tbl);
  end loop;
end $$;

-- =====================================================================
-- 10. Row Level Security (company-scoped)
-- =====================================================================
alter table email_accounts enable row level security;
alter table email_threads enable row level security;
alter table email_messages enable row level security;
alter table email_attachments enable row level security;
alter table email_tracking_events enable row level security;
alter table email_templates enable row level security;
alter table email_sequences enable row level security;
alter table email_sequence_steps enable row level security;
alter table email_sequence_enrollments enable row level security;

-- Direct company_id scoping
create policy email_accounts_company_rls on email_accounts for all
  using  (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

create policy email_threads_company_rls on email_threads for all
  using  (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

create policy email_messages_company_rls on email_messages for all
  using  (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

create policy email_templates_company_rls on email_templates for all
  using  (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

create policy email_sequences_company_rls on email_sequences for all
  using  (public.is_member_of_company(company_id))
  with check (public.is_member_of_company(company_id));

-- Scoped via message_id → email_messages.company_id
create or replace function public.get_email_message_company(p_message_id uuid)
returns uuid language sql stable security definer as $$
  select company_id from email_messages where id = p_message_id;
$$;

create policy email_attachments_company_rls on email_attachments for all
  using  (public.is_member_of_company(public.get_email_message_company(message_id)))
  with check (public.is_member_of_company(public.get_email_message_company(message_id)));

create policy email_tracking_company_rls on email_tracking_events for all
  using  (public.is_member_of_company(public.get_email_message_company(message_id)))
  with check (public.is_member_of_company(public.get_email_message_company(message_id)));

-- Scoped via sequence_id → email_sequences.company_id
create or replace function public.get_email_sequence_company(p_sequence_id uuid)
returns uuid language sql stable security definer as $$
  select company_id from email_sequences where id = p_sequence_id;
$$;

create policy email_sequence_steps_company_rls on email_sequence_steps for all
  using  (public.is_member_of_company(public.get_email_sequence_company(sequence_id)))
  with check (public.is_member_of_company(public.get_email_sequence_company(sequence_id)));

create policy email_sequence_enrollments_company_rls on email_sequence_enrollments for all
  using  (public.is_member_of_company(public.get_email_sequence_company(sequence_id)))
  with check (public.is_member_of_company(public.get_email_sequence_company(sequence_id)));

-- =====================================================================
-- 11. Denormalization trigger: bump thread + deal email_status on message insert
-- =====================================================================
create or replace function public.on_email_message_inserted()
returns trigger language plpgsql as $$
declare
  v_deal_id uuid;
begin
  -- Bump thread stats
  if new.direction = 'inbound' then
    update email_threads
       set last_message_at = coalesce(new.received_at, new.sent_at, now()),
           last_message_snippet = left(coalesce(new.snippet, new.body_text, ''), 280),
           message_count = message_count + 1,
           unread_count = unread_count + case when new.is_read then 0 else 1 end,
           is_waiting_on_them = false,
           awaiting_since = null,
           updated_at = now()
     where id = new.thread_id
     returning deal_id into v_deal_id;
  else
    update email_threads
       set last_message_at = coalesce(new.sent_at, now()),
           last_message_snippet = left(coalesce(new.snippet, new.body_text, ''), 280),
           message_count = message_count + 1,
           is_waiting_on_them = true,
           awaiting_since = coalesce(awaiting_since, coalesce(new.sent_at, now())),
           updated_at = now()
     where id = new.thread_id
     returning deal_id into v_deal_id;
  end if;

  -- Propagate to deal
  if v_deal_id is not null then
    if new.direction = 'inbound' then
      update deals
         set email_status = 'replied',
             last_inbound_at = coalesce(new.received_at, new.sent_at, now()),
             updated_at = now()
       where id = v_deal_id;
    else
      update deals
         set email_status = case when email_status = 'replied' then 'replied' else 'awaiting_reply' end,
             last_outbound_at = coalesce(new.sent_at, now()),
             updated_at = now()
       where id = v_deal_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_on_email_message_inserted on email_messages;
create trigger trg_on_email_message_inserted
  after insert on email_messages
  for each row execute procedure public.on_email_message_inserted();
