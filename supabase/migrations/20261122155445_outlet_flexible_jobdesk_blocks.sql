-- Warkop can divide jobdesk in flexible 30-minute blocks, while Tjap keeps
-- its existing fixed two-hour editor. This is stored as outlet SOP, not based
-- on the outlet name, so renaming an outlet cannot change scheduling rules.
alter table public.outlets
  add column if not exists flexible_jobdesk_blocks boolean not null default false;

update public.outlets
set flexible_jobdesk_blocks = true
where lower(trim(nama)) = 'warkop dki';
