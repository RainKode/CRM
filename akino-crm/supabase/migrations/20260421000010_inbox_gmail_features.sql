-- Gmail-style inbox additions: starring, unread threads list, and
-- soft-delete support via existing `status` column ('trashed'/'archived').

alter table email_threads
  add column if not exists is_starred boolean not null default false;

create index if not exists idx_email_threads_starred
  on email_threads(company_id, last_message_at desc)
  where is_starred = true;

create index if not exists idx_email_threads_status
  on email_threads(company_id, status, last_message_at desc);

-- Ensure PostgREST picks this up immediately.
notify pgrst, 'reload schema';
