CREATE TABLE public.nia_communications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK (kind IN ('call','email')), recipient text NOT NULL, subject text NOT NULL DEFAULT '', message text NOT NULL, status text NOT NULL DEFAULT 'pending', provider_id text, created_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz, source_key text UNIQUE);
GRANT ALL ON public.nia_communications TO service_role;
ALTER TABLE public.nia_communications ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.nia_routine_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), summary_id uuid);
GRANT ALL ON public.nia_routine_events TO service_role;
ALTER TABLE public.nia_routine_events ENABLE ROW LEVEL SECURITY;