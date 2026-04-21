-- =====================================================================
-- Milestone C: Email automation — scheduled sends, sequences, staleness
-- =====================================================================

-- 1. Add scheduled_send_at / send_status to email_messages ------------
alter table email_messages
  add column if not exists scheduled_send_at timestamptz,
  add column if not exists send_status text not null default 'sent',
  add column if not exists send_error text;

-- send_status values: 'sent' (already delivered), 'scheduled' (queued for
-- future send), 'sending' (currently being delivered), 'failed'
create index if not exists idx_email_messages_scheduled
  on email_messages(scheduled_send_at)
  where send_status = 'scheduled';

-- 2. Sequence enrollments: add next_send_at index for cron ------------
create index if not exists idx_email_seq_enroll_due
  on email_sequence_enrollments(next_send_at)
  where status = 'active';

-- 3. Mark deals stale when no reply after 14 days ---------------------
-- (Triggered by nightly cron, not by DB trigger.)

-- 4. Simple audit log for cron runs -----------------------------------
create table if not exists email_cron_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  ran_at timestamptz not null default now(),
  processed int not null default 0,
  failed int not null default 0,
  note text
);
create index if not exists idx_email_cron_runs_job on email_cron_runs(job_name, ran_at desc);

-- 5. Email analytics materialized view (refreshed nightly) ------------
-- Drop if exists to allow reshape.
drop materialized view if exists email_template_stats;
create materialized view email_template_stats as
select
  t.id as template_id,
  t.company_id,
  t.name,
  count(m.id) as sent_count,
  sum(coalesce(m.opens, 0)) as open_count,
  sum(coalesce(m.clicks, 0)) as click_count,
  sum(case when m.opens > 0 then 1 else 0 end) as opened_count,
  sum(case when m.clicks > 0 then 1 else 0 end) as clicked_count
from email_templates t
left join email_messages m
  on m.template_id = t.id and m.direction = 'outbound' and m.send_status = 'sent'
group by t.id, t.company_id, t.name;

create unique index if not exists uniq_email_template_stats on email_template_stats(template_id);

-- Refresh helper (callable from cron via rpc). Uses concurrently since we
-- have a unique index, so readers never see a locked view.
create or replace function refresh_email_template_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently email_template_stats;
end;
$$;

grant execute on function refresh_email_template_stats() to authenticated, service_role;
