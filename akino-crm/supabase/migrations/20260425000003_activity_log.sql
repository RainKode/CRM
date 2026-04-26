-- =====================================================================
-- Activity Log — unified activity feed (Phase 3)
-- =====================================================================
-- Separate from `activities` (which is deal-scoped). This table collects
-- pipeline, enrichment, and batch events for the dashboard activity card
-- and the /activity view-all page.
-- =====================================================================

-- 1. Table ------------------------------------------------------------

create table if not exists activity_log (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  actor_id     uuid references profiles(id) on delete set null,
  category     text not null check (category in ('pipeline', 'enrichment', 'batch')),
  action       text not null,
  entity_type  text,
  entity_id    uuid,
  entity_label text,
  metadata     jsonb,
  summary      text not null,
  occurred_at  timestamptz not null default now()
);

create index if not exists idx_activity_log_company_time
  on activity_log(company_id, occurred_at desc);

create index if not exists idx_activity_log_company_category_time
  on activity_log(company_id, category, occurred_at desc);

-- 2. RLS --------------------------------------------------------------

alter table activity_log enable row level security;

create policy activity_log_select on activity_log for select
  using (public.is_member_of_company(company_id));

create policy activity_log_insert on activity_log for insert
  with check (public.is_member_of_company(company_id));

-- 3. log_activity RPC (user-bound insert) ----------------------------

create or replace function public.log_activity(
  p_company_id   uuid,
  p_category     text,
  p_action       text,
  p_summary      text,
  p_entity_type  text  default null,
  p_entity_id    uuid  default null,
  p_entity_label text  default null,
  p_metadata     jsonb default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_member_of_company(p_company_id) then
    raise exception 'not authorised';
  end if;
  insert into activity_log(
    company_id, actor_id, category, action, entity_type, entity_id,
    entity_label, metadata, summary
  )
  values (
    p_company_id, auth.uid(), p_category, p_action, p_entity_type,
    p_entity_id, p_entity_label, p_metadata, p_summary
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.log_activity(uuid, text, text, text, text, uuid, text, jsonb)
  to authenticated;

-- 4. Mirror trigger: activities → activity_log for pipeline events ---
-- When a deal activity of type stage_change/won/lost is inserted, we
-- mirror it into activity_log so existing code paths show up without
-- any call-site changes.

create or replace function public._mirror_activity_to_log()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_label      text;
  v_summary    text;
begin
  -- Look up company from the deal
  select d.company_id, coalesce(d.company, d.contact_name, 'a deal')
    into v_company_id, v_label
    from deals d
   where d.id = NEW.deal_id;

  if v_company_id is null then
    return NEW;
  end if;

  v_summary := coalesce(NEW.summary,
    case NEW.type
      when 'stage_change' then 'Stage changed for ' || v_label
      when 'won'          then 'Deal won: '         || v_label
      when 'lost'         then 'Deal lost: '        || v_label
      else NEW.type || ' on '                       || v_label
    end
  );

  insert into activity_log(
    company_id, actor_id, category, action,
    entity_type, entity_id, entity_label, summary, occurred_at
  ) values (
    v_company_id, NEW.created_by, 'pipeline', NEW.type,
    'deal', NEW.deal_id, v_label, v_summary, NEW.occurred_at
  )
  on conflict do nothing;

  return NEW;
end;
$$;

drop trigger if exists trg_mirror_activity on activities;
create trigger trg_mirror_activity
  after insert on activities
  for each row
  when (NEW.type in ('stage_change', 'won', 'lost'))
  execute function public._mirror_activity_to_log();
