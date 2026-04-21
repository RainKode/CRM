-- =============================================================================
-- Phase 3 Milestone C — Email Automation
-- Scheduled sends, sequence dispatch tracking, awaiting-reply queue item type.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- email_messages: status + scheduled send support
-- -----------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'email_messages' and column_name = 'status'
  ) then
    alter table email_messages
      add column status text not null default 'sent',
      add column scheduled_send_at timestamptz,
      add column send_error text,
      add column sequence_enrollment_id uuid,
      add column sequence_step_id uuid;
  end if;
end $$;

create index if not exists idx_email_messages_scheduled
  on email_messages (scheduled_send_at)
  where status = 'scheduled';

create index if not exists idx_email_messages_status
  on email_messages (status);

-- -----------------------------------------------------------------------------
-- email_sequences: track defaults
-- -----------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'email_sequences' and column_name = 'track_opens'
  ) then
    alter table email_sequences
      add column track_opens boolean not null default true,
      add column track_clicks boolean not null default true,
      add column description text;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- email_sequence_enrollments: remember which account to send from
-- -----------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'email_sequence_enrollments' and column_name = 'from_account_id'
  ) then
    alter table email_sequence_enrollments
      add column from_account_id uuid references email_accounts(id) on delete set null,
      add column paused_at timestamptz,
      add column completed_at timestamptz,
      add column last_error text;
  end if;
end $$;

create index if not exists idx_enrollments_due
  on email_sequence_enrollments (next_send_at)
  where status = 'active';

-- -----------------------------------------------------------------------------
-- Ensure only one active enrollment per deal per sequence
-- -----------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'email_sequence_enrollments_deal_sequence_unique'
  ) then
    create unique index email_sequence_enrollments_deal_sequence_unique
      on email_sequence_enrollments (sequence_id, deal_id)
      where status in ('active', 'paused');
  end if;
end $$;
