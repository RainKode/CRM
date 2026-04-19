-- Add is_disqualified column to batch_leads
alter table batch_leads
  add column if not exists is_disqualified boolean not null default false;
