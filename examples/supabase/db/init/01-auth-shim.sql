-- Minimal stand-ins for what a real Supabase project provisions. `withAuthContext` (from
-- @venizia/ignis/postgres/supabase) needs exactly two things: a role it can `SET LOCAL ROLE` into,
-- and an `auth.uid()` function that reads the claims it sets with `set_config`. Everything else the
-- Supabase platform ships - GoTrue, PostgREST, Studio, Realtime, Kong - is unrelated to RLS itself,
-- so this example runs on plain Postgres instead of the full `supabase/postgres` image.
CREATE ROLE authenticated NOLOGIN NOINHERIT;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
