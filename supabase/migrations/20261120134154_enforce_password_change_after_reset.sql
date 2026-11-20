alter table public.users
  add column if not exists must_change_password boolean not null default false;

comment on column public.users.must_change_password is
  'Forces a crew account that was reset by a manager to choose a new password before using the application.';
