-- Per-user daily quota for the AI coach. Keeps API spend bounded per user.
create table if not exists public.coach_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  action text not null check (action in ('scene', 'postkit')),
  calls integer not null default 0,
  primary key (user_id, day, action)
);

alter table public.coach_usage enable row level security;

-- Users may read their own usage (e.g. to show "12 AI scans left today").
create policy "read own usage" on public.coach_usage
  for select using (auth.uid() = user_id);

-- Atomically count one call and return how many remain today.
-- Raises 'quota_exceeded' when the limit is reached; the row is not incremented then.
create or replace function public.consume_coach_quota(p_action text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_calls integer;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_action not in ('scene', 'postkit') then
    raise exception 'invalid_action';
  end if;

  insert into public.coach_usage (user_id, action, calls)
  values (v_user, p_action, 1)
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

revoke all on function public.consume_coach_quota(text, integer) from public;
grant execute on function public.consume_coach_quota(text, integer) to authenticated;
