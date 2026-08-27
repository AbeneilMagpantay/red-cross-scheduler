-- ARC REV 91 port: shared operational Alerts / FEED.

BEGIN;

CREATE TABLE IF NOT EXISTS public.arc_announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legacy_id TEXT UNIQUE,
  category TEXT NOT NULL DEFAULT 'General'
    CHECK (category IN ('Urgent', 'Operational Dispatch', 'Deployment', 'Training', 'General')),
  title TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  external_url TEXT,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  author_name TEXT NOT NULL DEFAULT 'ARC Council Operations',
  created_by UUID REFERENCES public.personnel(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.personnel(id) ON DELETE SET NULL,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arc_announcements_feed
  ON public.arc_announcements(is_pinned DESC, sort_order, created_at DESC);

DROP TRIGGER IF EXISTS set_arc_announcements_updated_at ON public.arc_announcements;
CREATE TRIGGER set_arc_announcements_updated_at
  BEFORE UPDATE ON public.arc_announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_arc_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_arc_announcement_pin_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_pinned AND (
    SELECT COUNT(*)
    FROM public.arc_announcements
    WHERE is_pinned = TRUE
      AND id <> NEW.id
  ) >= 3 THEN
    RAISE EXCEPTION 'A maximum of three urgent announcements can be pinned.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_arc_announcement_pin_limit ON public.arc_announcements;
CREATE TRIGGER enforce_arc_announcement_pin_limit
  BEFORE INSERT OR UPDATE OF is_pinned ON public.arc_announcements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_arc_announcement_pin_limit();

ALTER TABLE public.arc_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active members can view ARC announcements" ON public.arc_announcements;
DROP POLICY IF EXISTS "ARC members can manage announcements" ON public.arc_announcements;

CREATE POLICY "Active members can view ARC announcements"
  ON public.arc_announcements FOR SELECT TO authenticated
  USING (public.current_personnel_id() IS NOT NULL);

CREATE POLICY "ARC members can manage announcements"
  ON public.arc_announcements FOR ALL TO authenticated
  USING (public.current_personnel_can_access_arc())
  WITH CHECK (public.current_personnel_can_access_arc());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.arc_announcements TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'arc_announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.arc_announcements;
  END IF;
END;
$$;

COMMIT;

