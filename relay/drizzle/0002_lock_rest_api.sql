-- Supabase exposes `public` via PostgREST. RLS on with no policies = anon/authenticated roles see nothing.
-- The app connects as the table owner, which bypasses RLS; all authorization happens in the server layer.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t.tablename);
  END LOOP;
END $$;
