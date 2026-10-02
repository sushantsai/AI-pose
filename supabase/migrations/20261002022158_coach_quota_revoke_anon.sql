-- Supabase grants EXECUTE on new public functions to anon by default; only signed-in users may spend quota.
revoke execute on function public.consume_coach_quota(text, integer) from anon;
