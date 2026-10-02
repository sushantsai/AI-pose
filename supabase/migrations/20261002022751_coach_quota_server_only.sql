-- Only the edge function (service role) may spend quota; it passes the user id it verified from the JWT.
create or replace function public.consume_coach_quota(p_user uuid, p_action text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calls integer;
begin
  if p_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_action not in ('scene', 'postkit') then
    raise exception 'invalid_action';
  end if;

  insert into public.coach_usage (user_id, action, calls)
  values (p_user, p_action, 1)
  on conflict (user_id, day, action)
    do update set calls = coach_usage.calls + 1
    where coach_usage.calls < p_limit
  returning calls into v_calls;

  if v_calls is null then
    raise exception 'quota_exceeded';
  end if;
  return p_limit - v_calls;
end;
$$;

revoke all on function public.consume_coach_quota(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.consume_coach_quota(uuid, text, integer) to service_role;

-- Retire the old user-callable version.
revoke all on function public.consume_coach_quota(text, integer) from public, anon, authenticated;
