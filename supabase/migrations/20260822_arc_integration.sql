-- ARC integration: Officer access, NEXUS resources, CORE shared fields,
-- and private QR image storage.

BEGIN;

-- Staff never had permissions distinct from volunteers. Promote existing
-- staff records into the new Officer role before tightening the constraint.
ALTER TABLE public.personnel
  DROP CONSTRAINT IF EXISTS personnel_role_check;

UPDATE public.personnel
SET role = 'officer', updated_at = NOW()
WHERE role = 'staff';

ALTER TABLE public.personnel
  ADD CONSTRAINT personnel_role_check
  CHECK (role IN ('admin', 'officer', 'volunteer'));

CREATE OR REPLACE FUNCTION public.current_personnel_can_access_arc()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT personnel.role IN ('admin', 'officer')
        AND personnel.is_active IS NOT FALSE
      FROM public.personnel
      WHERE personnel.id = public.current_personnel_id()
    ),
    FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.current_personnel_can_access_arc() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_personnel_can_access_arc() TO authenticated;

-- Role checks are security-sensitive now that Officer grants ARC access.
-- Replace the original prototype policy that allowed any authenticated user
-- to update Personnel and Departments directly through the API.
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.personnel;
DROP POLICY IF EXISTS "Authenticated users can view personnel" ON public.personnel;
DROP POLICY IF EXISTS "Admins can create personnel" ON public.personnel;
DROP POLICY IF EXISTS "Admins can update personnel" ON public.personnel;
DROP POLICY IF EXISTS "Admins can delete personnel" ON public.personnel;

CREATE POLICY "Authenticated users can view personnel"
  ON public.personnel FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Admins can create personnel"
  ON public.personnel FOR INSERT TO authenticated
  WITH CHECK (public.current_personnel_is_admin());

CREATE POLICY "Admins can update personnel"
  ON public.personnel FOR UPDATE TO authenticated
  USING (public.current_personnel_is_admin())
  WITH CHECK (public.current_personnel_is_admin());

CREATE POLICY "Admins can delete personnel"
  ON public.personnel FOR DELETE TO authenticated
  USING (public.current_personnel_is_admin());

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.departments;
DROP POLICY IF EXISTS "Authenticated users can view departments" ON public.departments;
DROP POLICY IF EXISTS "Admins can create departments" ON public.departments;
DROP POLICY IF EXISTS "Admins can update departments" ON public.departments;
DROP POLICY IF EXISTS "Admins can delete departments" ON public.departments;

CREATE POLICY "Authenticated users can view departments"
  ON public.departments FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Admins can create departments"
  ON public.departments FOR INSERT TO authenticated
  WITH CHECK (public.current_personnel_is_admin());

CREATE POLICY "Admins can update departments"
  ON public.departments FOR UPDATE TO authenticated
  USING (public.current_personnel_is_admin())
  WITH CHECK (public.current_personnel_is_admin());

CREATE POLICY "Admins can delete departments"
  ON public.departments FOR DELETE TO authenticated
  USING (public.current_personnel_is_admin());

CREATE TABLE IF NOT EXISTS public.arc_resources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legacy_id TEXT UNIQUE,
  title TEXT NOT NULL DEFAULT 'ARC Resource',
  url TEXT,
  description_html TEXT,
  qr_image_path TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.personnel(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.personnel(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arc_resources_sort_order
  ON public.arc_resources(sort_order, created_at);

-- CORE stays field-based for the first integration so its current editable
-- table and existing Upstash data can be preserved without restructuring.
CREATE TABLE IF NOT EXISTS public.arc_core_fields (
  field_key TEXT PRIMARY KEY,
  field_value TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES public.personnel(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.set_arc_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_arc_resources_updated_at ON public.arc_resources;
CREATE TRIGGER set_arc_resources_updated_at
  BEFORE UPDATE ON public.arc_resources
  FOR EACH ROW EXECUTE FUNCTION public.set_arc_updated_at();

DROP TRIGGER IF EXISTS set_arc_core_fields_updated_at ON public.arc_core_fields;
CREATE TRIGGER set_arc_core_fields_updated_at
  BEFORE UPDATE ON public.arc_core_fields
  FOR EACH ROW EXECUTE FUNCTION public.set_arc_updated_at();

ALTER TABLE public.arc_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arc_core_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ARC members can view resources" ON public.arc_resources;
DROP POLICY IF EXISTS "ARC members can manage resources" ON public.arc_resources;
DROP POLICY IF EXISTS "ARC members can view CORE" ON public.arc_core_fields;
DROP POLICY IF EXISTS "ARC members can manage CORE" ON public.arc_core_fields;

CREATE POLICY "ARC members can view resources"
  ON public.arc_resources FOR SELECT TO authenticated
  USING (public.current_personnel_can_access_arc());

CREATE POLICY "ARC members can manage resources"
  ON public.arc_resources FOR ALL TO authenticated
  USING (public.current_personnel_can_access_arc())
  WITH CHECK (public.current_personnel_can_access_arc());

CREATE POLICY "ARC members can view CORE"
  ON public.arc_core_fields FOR SELECT TO authenticated
  USING (public.current_personnel_can_access_arc());

CREATE POLICY "ARC members can manage CORE"
  ON public.arc_core_fields FOR ALL TO authenticated
  USING (public.current_personnel_can_access_arc())
  WITH CHECK (public.current_personnel_can_access_arc());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.arc_resources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arc_core_fields TO authenticated;

-- QR images are private. Signed URLs are generated only after the database
-- confirms that the current account is an Admin or Officer.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'arc-resource-qr',
  'arc-resource-qr',
  FALSE,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "ARC members can view QR images" ON storage.objects;
DROP POLICY IF EXISTS "ARC members can upload QR images" ON storage.objects;
DROP POLICY IF EXISTS "ARC members can update QR images" ON storage.objects;
DROP POLICY IF EXISTS "ARC members can delete QR images" ON storage.objects;

CREATE POLICY "ARC members can view QR images"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'arc-resource-qr'
    AND public.current_personnel_can_access_arc()
  );

CREATE POLICY "ARC members can upload QR images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'arc-resource-qr'
    AND public.current_personnel_can_access_arc()
  );

CREATE POLICY "ARC members can update QR images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'arc-resource-qr'
    AND public.current_personnel_can_access_arc()
  )
  WITH CHECK (
    bucket_id = 'arc-resource-qr'
    AND public.current_personnel_can_access_arc()
  );

CREATE POLICY "ARC members can delete QR images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'arc-resource-qr'
    AND public.current_personnel_can_access_arc()
  );

-- Realtime keeps officers' open NEXUS and CORE screens synchronized.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'arc_resources'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.arc_resources;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'arc_core_fields'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.arc_core_fields;
  END IF;
END;
$$;

COMMIT;
