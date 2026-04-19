-- Fix infinite recursion: is_active_member() queries profiles which has RLS
-- that calls is_active_member(). Using security definer bypasses RLS inside the function.
create or replace function public.is_active_member()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and is_active = true
  );
$$;
