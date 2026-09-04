-- Reliable account resolution, self-service account approval, Officer schedule
-- management, and read-only NEXUS/CORE access for all active members.

BEGIN;

-- Officers can manage operational content, while administrator-only account,
-- attendance, swap-approval, and personnel controls remain unchanged.
CREATE OR REPLACE FUNCTION public.current_personnel_can_manage_operations()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT personnel.role IN ('admin', 'officer')
    FROM public.personnel
    WHERE personnel.id = public.current_personnel_id()
      AND personnel.is_active = TRUE
    LIMIT 1
  ), FALSE);
$$;

REVOKE ALL ON FUNCTION public.current_personnel_can_manage_operations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_personnel_can_manage_operations() TO authenticated;

-- An inactive member may read only their own Personnel row so the client can
-- show the correct inactive state instead of an unexplained missing profile.
DROP POLICY IF EXISTS "Users can view their own personnel status" ON public.personnel;
CREATE POLICY "Users can view their own personnel status"
  ON public.personnel FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR lower(email) = lower(auth.jwt() ->> 'email')
  );

-- Every active member can read NEXUS and CORE. Only Officers and
-- Administrators can change them.
DROP POLICY IF EXISTS "ARC members can view resources" ON public.arc_resources;
DROP POLICY IF EXISTS "ARC members can manage resources" ON public.arc_resources;
DROP POLICY IF EXISTS "Active personnel can view ARC resources" ON public.arc_resources;
DROP POLICY IF EXISTS "Operations managers can manage ARC resources" ON public.arc_resources;

CREATE POLICY "Active personnel can view ARC resources"
  ON public.arc_resources FOR SELECT TO authenticated
  USING (public.current_personnel_id() IS NOT NULL);

CREATE POLICY "Operations managers can manage ARC resources"
  ON public.arc_resources FOR ALL TO authenticated
  USING (public.current_personnel_can_manage_operations())
  WITH CHECK (public.current_personnel_can_manage_operations());

DROP POLICY IF EXISTS "ARC members can view CORE" ON public.arc_core_fields;
DROP POLICY IF EXISTS "ARC members can manage CORE" ON public.arc_core_fields;
DROP POLICY IF EXISTS "Active personnel can view CORE" ON public.arc_core_fields;
DROP POLICY IF EXISTS "Operations managers can manage CORE" ON public.arc_core_fields;

CREATE POLICY "Active personnel can view CORE"
  ON public.arc_core_fields FOR SELECT TO authenticated
  USING (public.current_personnel_id() IS NOT NULL);

CREATE POLICY "Operations managers can manage CORE"
  ON public.arc_core_fields FOR ALL TO authenticated
  USING (public.current_personnel_can_manage_operations())
  WITH CHECK (public.current_personnel_can_manage_operations());

-- QR images follow the same view/edit boundary as their NEXUS records.
DROP POLICY IF EXISTS "ARC members can view QR images" ON storage.objects;
DROP POLICY IF EXISTS "ARC members can upload QR images" ON storage.objects;
DROP POLICY IF EXISTS "ARC members can update QR images" ON storage.objects;
DROP POLICY IF EXISTS "ARC members can delete QR images" ON storage.objects;
DROP POLICY IF EXISTS "Active personnel can view QR images" ON storage.objects;
DROP POLICY IF EXISTS "Operations managers can upload QR images" ON storage.objects;
DROP POLICY IF EXISTS "Operations managers can update QR images" ON storage.objects;
DROP POLICY IF EXISTS "Operations managers can delete QR images" ON storage.objects;

CREATE POLICY "Active personnel can view QR images"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'arc-resource-qr'
    AND public.current_personnel_id() IS NOT NULL
  );

CREATE POLICY "Operations managers can upload QR images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'arc-resource-qr'
    AND public.current_personnel_can_manage_operations()
  );

CREATE POLICY "Operations managers can update QR images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'arc-resource-qr'
    AND public.current_personnel_can_manage_operations()
  )
  WITH CHECK (
    bucket_id = 'arc-resource-qr'
    AND public.current_personnel_can_manage_operations()
  );

CREATE POLICY "Operations managers can delete QR images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'arc-resource-qr'
    AND public.current_personnel_can_manage_operations()
  );

-- Officers may create and edit upcoming events, teams, and assignments.
-- Only Administrators can remove an event anchor or delete concluded events.
DROP POLICY IF EXISTS "Admins and owners can create schedules" ON public.schedules;
DROP POLICY IF EXISTS "Admins and owners can update schedules" ON public.schedules;
DROP POLICY IF EXISTS "Admins and owners can delete schedules" ON public.schedules;
DROP POLICY IF EXISTS "Operations managers and owners can create schedules" ON public.schedules;
DROP POLICY IF EXISTS "Operations managers and owners can update schedules" ON public.schedules;
DROP POLICY IF EXISTS "Operations managers and owners can delete schedules" ON public.schedules;

CREATE POLICY "Operations managers and owners can create schedules"
  ON public.schedules FOR INSERT TO authenticated
  WITH CHECK (
    public.current_personnel_can_manage_operations()
    OR personnel_id = public.current_personnel_id()
  );

CREATE POLICY "Operations managers and owners can update schedules"
  ON public.schedules FOR UPDATE TO authenticated
  USING (
    public.current_personnel_can_manage_operations()
    OR personnel_id = public.current_personnel_id()
  )
  WITH CHECK (
    public.current_personnel_can_manage_operations()
    OR personnel_id = public.current_personnel_id()
  );

CREATE POLICY "Operations managers and owners can delete schedules"
  ON public.schedules FOR DELETE TO authenticated
  USING (
    public.current_personnel_is_admin()
    OR personnel_id = public.current_personnel_id()
    OR (
      public.current_personnel_can_manage_operations()
      AND is_event_anchor IS NOT TRUE
    )
  );

DROP POLICY IF EXISTS "Admins can manage duty teams" ON public.duty_teams;
DROP POLICY IF EXISTS "Operations managers can manage duty teams" ON public.duty_teams;
CREATE POLICY "Operations managers can manage duty teams"
  ON public.duty_teams FOR ALL TO authenticated
  USING (public.current_personnel_can_manage_operations())
  WITH CHECK (public.current_personnel_can_manage_operations());

CREATE OR REPLACE FUNCTION public.enforce_duty_team_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  team_event_id UUID;
  source_event schedules%ROWTYPE;
  actor_is_admin BOOLEAN := public.current_personnel_is_admin();
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF NOT public.current_personnel_can_manage_operations() THEN
    RAISE EXCEPTION 'Only administrators and officers can manage duty teams.';
  END IF;

  IF TG_OP = 'UPDATE' AND NOT actor_is_admin
    AND ROW(NEW.id, NEW.event_id, NEW.event_anchor_id, NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id, OLD.event_id, OLD.event_anchor_id, OLD.created_at) THEN
    RAISE EXCEPTION 'Officers cannot change the event identity of a duty team.';
  END IF;

  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM schedules WHERE id = OLD.event_anchor_id
  ) THEN
    RETURN OLD;
  END IF;

  team_event_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.event_id ELSE NEW.event_id END;

  SELECT * INTO source_event
  FROM schedules
  WHERE event_id = team_event_id
  ORDER BY (is_event_anchor = TRUE) DESC, created_at
  LIMIT 1;

  IF source_event.id IS NOT NULL
    AND public.schedule_event_is_concluded(source_event.event_id, source_event.duty_date, source_event.end_time) THEN
    RAISE EXCEPTION 'Teams for concluded events can no longer be changed.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_schedule_assignment_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := public.current_personnel_id();
  actor_is_admin BOOLEAN := public.current_personnel_is_admin();
  actor_can_manage BOOLEAN := public.current_personnel_can_manage_operations();
  source_event schedules%ROWTYPE;
  target_schedule schedules%ROWTYPE;
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.team_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM duty_teams
    WHERE id = NEW.team_id AND event_id = NEW.event_id
  ) THEN
    RAISE EXCEPTION 'The selected team does not belong to this event.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF actor_can_manage THEN RETURN NEW; END IF;

    IF actor_id IS NULL OR NEW.personnel_id IS DISTINCT FROM actor_id THEN
      RAISE EXCEPTION 'You can only register yourself for an event.';
    END IF;

    SELECT * INTO source_event
    FROM schedules
    WHERE event_id = NEW.event_id
    ORDER BY (is_event_anchor = TRUE) DESC, created_at
    LIMIT 1;

    IF source_event.id IS NULL THEN
      RAISE EXCEPTION 'The selected event no longer exists.';
    END IF;
    IF public.schedule_event_is_concluded(source_event.event_id, source_event.duty_date, source_event.end_time) THEN
      RAISE EXCEPTION 'This event has already concluded.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM schedules
      WHERE event_id = NEW.event_id AND personnel_id = actor_id
    ) THEN
      RAISE EXCEPTION 'You are already registered for this event.';
    END IF;

    NEW.duty_date := source_event.duty_date;
    NEW.title := source_event.title;
    NEW.duty_description := source_event.duty_description;
    NEW.precise_location := source_event.precise_location;
    NEW.meetup_place := source_event.meetup_place;
    NEW.organization_event_head := source_event.organization_event_head;
    NEW.organization := source_event.organization;
    NEW.coordinator := source_event.coordinator;
    NEW.contact_person := source_event.contact_person;
    NEW.contact_number := source_event.contact_number;
    NEW.reminder_offsets := source_event.reminder_offsets;
    NEW.is_deployment_event := source_event.is_deployment_event;
    NEW.is_event_anchor := FALSE;
    NEW.team_id := NULL;
    NEW.team_station := NULL;
    NEW.assignment_role := NULL;
    RETURN NEW;
  END IF;

  target_schedule := OLD;

  IF TG_OP = 'DELETE' AND actor_is_admin THEN RETURN OLD; END IF;

  IF public.schedule_event_is_concluded(target_schedule.event_id, target_schedule.duty_date, target_schedule.end_time) THEN
    RAISE EXCEPTION 'Concluded events can no longer be changed.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM attendance
    WHERE schedule_id = target_schedule.id AND check_out IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This duty can no longer be changed after check-out.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF actor_can_manage AND OLD.is_event_anchor IS NOT TRUE THEN RETURN OLD; END IF;
    IF actor_id IS NULL OR OLD.personnel_id IS DISTINCT FROM actor_id THEN
      RAISE EXCEPTION 'You can only remove your own registration.';
    END IF;
    RETURN OLD;
  END IF;

  IF actor_can_manage AND NOT actor_is_admin
    AND ROW(NEW.id, NEW.event_id, NEW.is_event_anchor, NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id, OLD.event_id, OLD.is_event_anchor, OLD.created_at) THEN
    RAISE EXCEPTION 'Officers cannot change the identity of a schedule record.';
  END IF;

  IF NOT actor_can_manage THEN
    IF actor_id IS NULL OR OLD.personnel_id IS DISTINCT FROM actor_id THEN
      RAISE EXCEPTION 'You can only edit your own duty assignment.';
    END IF;

    IF ROW(
      NEW.id, NEW.event_id, NEW.personnel_id, NEW.duty_date, NEW.title,
      NEW.duty_description, NEW.precise_location, NEW.meetup_place,
      NEW.team_id, NEW.team_station, NEW.assignment_role,
      NEW.organization_event_head, NEW.organization, NEW.coordinator,
      NEW.contact_person, NEW.contact_number, NEW.reminder_offsets,
      NEW.is_deployment_event, NEW.is_event_anchor, NEW.created_at
    ) IS DISTINCT FROM ROW(
      OLD.id, OLD.event_id, OLD.personnel_id, OLD.duty_date, OLD.title,
      OLD.duty_description, OLD.precise_location, OLD.meetup_place,
      OLD.team_id, OLD.team_station, OLD.assignment_role,
      OLD.organization_event_head, OLD.organization, OLD.coordinator,
      OLD.contact_person, OLD.contact_number, OLD.reminder_offsets,
      OLD.is_deployment_event, OLD.is_event_anchor, OLD.created_at
    ) THEN
      RAISE EXCEPTION 'You may only edit your own time and notes.';
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- New Auth users become pending requests. Approval activates an existing
-- email-matched Personnel record when possible, preserving its duty history.
CREATE TABLE IF NOT EXISTS public.account_requests (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.personnel(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_requests_status_created
  ON public.account_requests(status, created_at);

ALTER TABLE public.account_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_requests FROM anon, authenticated;
GRANT SELECT ON public.account_requests TO authenticated;

DROP POLICY IF EXISTS "Users and admins can view account requests" ON public.account_requests;
CREATE POLICY "Users and admins can view account requests"
  ON public.account_requests FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.current_personnel_is_admin()
  );

CREATE OR REPLACE FUNCTION public.create_account_request_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  request_name TEXT;
BEGIN
  -- Do not put unverified addresses into the administrator queue. This keeps
  -- automated sign-up spam from generating approval alerts.
  IF NEW.email IS NULL OR NEW.email_confirmed_at IS NULL THEN RETURN NEW; END IF;

  -- A pre-existing active Personnel record is an administrator's implicit
  -- approval. Email fallback also keeps restored account history connected.
  IF EXISTS (
    SELECT 1 FROM public.personnel
    WHERE is_active = TRUE
      AND (id = NEW.id OR lower(email) = lower(NEW.email))
  ) THEN
    RETURN NEW;
  END IF;

  request_name := NULLIF(BTRIM(COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    split_part(NEW.email, '@', 1)
  )), '');

  INSERT INTO public.account_requests (user_id, email, name, phone, status)
  VALUES (
    NEW.id,
    lower(NEW.email),
    LEFT(COALESCE(request_name, 'New member'), 255),
    NULLIF(LEFT(BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'phone', '')), 50), ''),
    'pending'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    status = CASE
      WHEN public.account_requests.status = 'approved' THEN 'approved'
      ELSE 'pending'
    END,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_account_request_after_signup ON auth.users;
CREATE TRIGGER create_account_request_after_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_account_request_for_new_user();

DROP TRIGGER IF EXISTS create_account_request_after_email_confirmation ON auth.users;
CREATE TRIGGER create_account_request_after_email_confirmation
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.create_account_request_for_new_user();

REVOKE ALL ON FUNCTION public.create_account_request_for_new_user() FROM PUBLIC;

-- Existing Auth accounts that never received a Personnel profile are brought
-- into the same review queue instead of being left on an unexplained denial.
INSERT INTO public.account_requests (user_id, email, name, status, created_at)
SELECT
  auth_user.id,
  lower(auth_user.email),
  LEFT(COALESCE(
    NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(BTRIM(auth_user.raw_user_meta_data ->> 'name'), ''),
    split_part(auth_user.email, '@', 1),
    'New member'
  ), 255),
  'pending',
  auth_user.created_at
FROM auth.users AS auth_user
WHERE auth_user.email IS NOT NULL
  AND auth_user.email_confirmed_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.personnel
    WHERE is_active = TRUE
      AND (personnel.id = auth_user.id OR lower(personnel.email) = lower(auth_user.email))
  )
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.approve_account_request(target_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := public.current_personnel_id();
  request_row public.account_requests%ROWTYPE;
  personnel_id UUID;
BEGIN
  IF NOT public.current_personnel_is_admin() THEN
    RAISE EXCEPTION 'Only administrators can approve accounts.';
  END IF;

  SELECT * INTO request_row
  FROM public.account_requests
  WHERE user_id = target_user_id
  FOR UPDATE;

  IF request_row.user_id IS NULL THEN
    RAISE EXCEPTION 'Account request not found.';
  END IF;

  SELECT id INTO personnel_id
  FROM public.personnel
  WHERE id = request_row.user_id OR lower(email) = lower(request_row.email)
  ORDER BY CASE WHEN id = request_row.user_id THEN 0 ELSE 1 END, created_at
  LIMIT 1;

  IF personnel_id IS NULL THEN
    INSERT INTO public.personnel (id, name, email, phone, role, is_active)
    VALUES (request_row.user_id, request_row.name, lower(request_row.email), request_row.phone, 'volunteer', TRUE)
    RETURNING id INTO personnel_id;
  ELSE
    UPDATE public.personnel
    SET name = request_row.name,
        email = lower(request_row.email),
        phone = COALESCE(request_row.phone, phone),
        is_active = TRUE,
        updated_at = NOW()
    WHERE id = personnel_id;
  END IF;

  UPDATE public.account_requests
  SET status = 'approved', reviewed_by = actor_id, reviewed_at = NOW(), updated_at = NOW()
  WHERE user_id = target_user_id;

  RETURN personnel_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_account_request(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_personnel_is_admin() THEN
    RAISE EXCEPTION 'Only administrators can decline accounts.';
  END IF;

  UPDATE public.account_requests
  SET status = 'rejected',
      reviewed_by = public.current_personnel_id(),
      reviewed_at = NOW(),
      updated_at = NOW()
  WHERE user_id = target_user_id
    AND status <> 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending account request not found.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_account_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_account_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_account_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_account_request(UUID) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'account_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.account_requests;
  END IF;
END;
$$;

COMMIT;
