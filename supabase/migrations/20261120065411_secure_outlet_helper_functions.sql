-- SECURITY DEFINER helpers are used inside RLS policies only.  Anonymous API
-- callers must never be able to invoke them directly.
revoke all on function public.current_outlet_id() from public, anon;
revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_outlet_id() to authenticated;
grant execute on function public.current_app_role() to authenticated;
