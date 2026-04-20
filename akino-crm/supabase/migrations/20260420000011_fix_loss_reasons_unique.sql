-- Fix loss_reasons unique constraint: label must be unique per company, not globally.
-- Also backfill missing loss_reasons for any company that was partially created.

-- Drop the global unique constraint on label
alter table loss_reasons drop constraint if exists loss_reasons_label_key;

-- Add a unique constraint scoped to company_id
alter table loss_reasons add constraint loss_reasons_company_label_key unique (company_id, label);

-- Backfill loss reasons for companies that have none
insert into loss_reasons (label, position, company_id)
select lr.label, lr.position, c.id
from companies c
cross join (values
  ('No Response', 0),
  ('Budget', 1),
  ('Wrong Contact', 2),
  ('Went with Competitor', 3),
  ('Not Interested', 4),
  ('Other', 5)
) as lr(label, position)
where not exists (
  select 1 from loss_reasons where company_id = c.id
);
