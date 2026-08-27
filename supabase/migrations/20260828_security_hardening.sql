-- Security hardening: replace prototype-wide access with active-member and
-- owner/admin policies, and validate browser push subscriptions before they
-- can be used by the notification functions.

BEGIN;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_reminder_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arc_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arc_core_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arc_announcements ENABLE ROW LEVEL SECURITY;

-- Client roles should receive only the table privileges the application uses.
-- RLS then decides which rows each authenticated account may access.
REVOKE ALL ON TABLE
  public.departments,
  public.personnel,
  public.schedules,
  public.attendance,
  public.swap_requests,
  public.push_subscriptions,
  public.duty_reminder_deliveries,
  public.duty_teams,
  public.arc_resources,
  public.arc_core_fields,
  public.arc_announcements
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.departments,
  public.personnel,
  public.schedules,
  public.attendance,
  public.swap_requests,
  public.push_subscriptions,
  public.duty_teams,
  public.arc_resources,
  public.arc_core_fields,
  public.arc_announcements
TO authenticated;

-- duty_reminder_deliveries intentionally stays service-role only.

-- Only active Personnel may read the shared directory and operational data.
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.personnel;
DROP POLICY IF EXISTS "Authenticated users can view personnel" ON public.personnel;
DROP POLICY IF EXISTS "Active personnel can view personnel" ON public.personnel;
CREATE POLICY "Active personnel can view personnel"
  ON public.personnel FOR SELECT TO authenticated
  USING (public.current_personnel_id() IS NOT NULL);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.departments;
DROP POLICY IF EXISTS "Authenticated users can view departments" ON public.departments;
DROP POLICY IF EXISTS "Active personnel can view departments" ON public.departments;
CREATE POLICY "Active personnel can view departments"
  ON public.departments FOR SELECT TO authenticated
  USING (public.current_personnel_id() IS NOT NULL);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.schedules;
DROP POLICY IF EXISTS "Authenticated users can view schedules" ON public.schedules;
DROP POLICY IF EXISTS "Active personnel can view schedules" ON public.schedules;
CREATE POLICY "Active personnel can view schedules"
  ON public.schedules FOR SELECT TO authenticated
  USING (public.current_personnel_id() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can view duty teams" ON public.duty_teams;
DROP POLICY IF EXISTS "Active personnel can view duty teams" ON public.duty_teams;
CREATE POLICY "Active personnel can view duty teams"
  ON public.duty_teams FOR SELECT TO authenticated
  USING (public.current_personnel_id() IS NOT NULL);

-- Attendance may be viewed by active members. Administrators can manage every
-- record; volunteers can check in/out or set a status only for themselves and
-- only for a schedule that is assigned to them.
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.attendance;
DROP POLICY IF EXISTS "Active personnel can view attendance" ON public.attendance;
DROP POLICY IF EXISTS "Admins and owners can create attendance" ON public.attendance;
DROP POLICY IF EXISTS "Admins and owners can update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Admins can delete attendance" ON public.attendance;

CREATE POLICY "Active personnel can view attendance"
  ON public.attendance FOR SELECT TO authenticated
  USING (public.current_personnel_id() IS NOT NULL);

CREATE POLICY "Admins and owners can create attendance"
  ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (
    public.current_personnel_is_admin()
    OR (
      personnel_id = public.current_personnel_id()
      AND EXISTS (
        SELECT 1
        FROM public.schedules AS schedule
        WHERE schedule.id = schedule_id
          AND schedule.personnel_id = public.current_personnel_id()
      )
    )
  );

CREATE POLICY "Admins and owners can update attendance"
  ON public.attendance FOR UPDATE TO authenticated
  USING (
    public.current_personnel_is_admin()
    OR personnel_id = public.current_personnel_id()
  )
  WITH CHECK (
    public.current_personnel_is_admin()
    OR (
      personnel_id = public.current_personnel_id()
      AND EXISTS (
        SELECT 1
        FROM public.schedules AS schedule
        WHERE schedule.id = schedule_id
          AND schedule.personnel_id = public.current_personnel_id()
      )
    )
  );

CREATE POLICY "Admins can delete attendance"
  ON public.attendance FOR DELETE TO authenticated
  USING (public.current_personnel_is_admin());

CREATE OR REPLACE FUNCTION public.enforce_attendance_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := public.current_personnel_id();
  actor_is_admin BOOLEAN := public.current_personnel_is_admin();
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT actor_is_admin THEN
      RAISE EXCEPTION 'Only administrators can delete attendance records.';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.schedules AS schedule
    WHERE schedule.id = NEW.schedule_id
      AND schedule.personnel_id = NEW.personnel_id
  ) THEN
    RAISE EXCEPTION 'Attendance must match the personnel assigned to the schedule.';
  END IF;

  IF NEW.check_in IS NOT NULL
    AND NEW.check_out IS NOT NULL
    AND NEW.check_out < NEW.check_in THEN
    RAISE EXCEPTION 'Check-out cannot be earlier than check-in.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT actor_is_admin AND (actor_id IS NULL OR NEW.personnel_id IS DISTINCT FROM actor_id) THEN
      RAISE EXCEPTION 'You can only record your own attendance.';
    END IF;
    NEW.created_at := NOW();
    RETURN NEW;
  END IF;

  IF NOT actor_is_admin THEN
    IF actor_id IS NULL OR OLD.personnel_id IS DISTINCT FROM actor_id THEN
      RAISE EXCEPTION 'You can only update your own attendance.';
    END IF;

    IF ROW(NEW.id, NEW.schedule_id, NEW.personnel_id, NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id, OLD.schedule_id, OLD.personnel_id, OLD.created_at) THEN
      RAISE EXCEPTION 'Schedule and personnel cannot be changed on an attendance record.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_attendance_rules_trigger ON public.attendance;
CREATE TRIGGER enforce_attendance_rules_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_rules();

-- Swap requests are private to the requester, target, and administrators.
-- Only administrators may approve or reject them.
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.swap_requests;
DROP POLICY IF EXISTS "Participants and admins can view swap requests" ON public.swap_requests;
DROP POLICY IF EXISTS "Personnel can create their own swap requests" ON public.swap_requests;
DROP POLICY IF EXISTS "Admins can update swap requests" ON public.swap_requests;
DROP POLICY IF EXISTS "Admins and requesters can delete swap requests" ON public.swap_requests;

CREATE POLICY "Participants and admins can view swap requests"
  ON public.swap_requests FOR SELECT TO authenticated
  USING (
    public.current_personnel_is_admin()
    OR requester_id = public.current_personnel_id()
    OR target_id = public.current_personnel_id()
  );

CREATE POLICY "Personnel can create their own swap requests"
  ON public.swap_requests FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = public.current_personnel_id()
    AND requester_id IS DISTINCT FROM target_id
    AND status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.schedules AS schedule
      WHERE schedule.id = schedule_id
        AND schedule.personnel_id = public.current_personnel_id()
    )
    AND EXISTS (
      SELECT 1
      FROM public.personnel AS target
      WHERE target.id = target_id
        AND target.is_active = TRUE
    )
  );

CREATE POLICY "Admins can update swap requests"
  ON public.swap_requests FOR UPDATE TO authenticated
  USING (public.current_personnel_is_admin())
  WITH CHECK (public.current_personnel_is_admin());

CREATE POLICY "Admins and requesters can delete swap requests"
  ON public.swap_requests FOR DELETE TO authenticated
  USING (
    public.current_personnel_is_admin()
    OR (requester_id = public.current_personnel_id() AND status = 'pending')
  );

CREATE OR REPLACE FUNCTION public.enforce_swap_request_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := public.current_personnel_id();
  actor_is_admin BOOLEAN := public.current_personnel_is_admin();
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF actor_id IS NULL OR NEW.requester_id IS DISTINCT FROM actor_id THEN
      RAISE EXCEPTION 'You can only create your own swap request.';
    END IF;
    IF NEW.requester_id IS NOT DISTINCT FROM NEW.target_id THEN
      RAISE EXCEPTION 'Choose another person for the swap.';
    END IF;
    IF NEW.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'New swap requests must be pending.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.schedules
      WHERE id = NEW.schedule_id AND personnel_id = actor_id
    ) THEN
      RAISE EXCEPTION 'You can only request a swap for your own schedule.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.personnel
      WHERE id = NEW.target_id AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'The selected personnel account is not active.';
    END IF;
    NEW.created_at := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT actor_is_admin
      AND (actor_id IS NULL OR OLD.requester_id IS DISTINCT FROM actor_id OR OLD.status IS DISTINCT FROM 'pending') THEN
      RAISE EXCEPTION 'Only a pending request of your own can be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT actor_is_admin THEN
    RAISE EXCEPTION 'Only administrators can approve or reject swap requests.';
  END IF;

  IF OLD.status IS DISTINCT FROM 'pending'
    OR NEW.status IS NULL
    OR NEW.status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Only pending swap requests can be approved or rejected.';
  END IF;

  IF ROW(NEW.id, NEW.requester_id, NEW.target_id, NEW.schedule_id, NEW.reason, NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id, OLD.requester_id, OLD.target_id, OLD.schedule_id, OLD.reason, OLD.created_at) THEN
    RAISE EXCEPTION 'Only the status of a swap request can be changed.';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_swap_request_rules_trigger ON public.swap_requests;
CREATE TRIGGER enforce_swap_request_rules_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.swap_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_swap_request_rules();

-- Push subscriptions contain server request destinations. Accept only known
-- browser push-service endpoints and cap the number stored per account.
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_length_check,
  DROP CONSTRAINT IF EXISTS push_subscriptions_payload_size_check,
  DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_match_check,
  DROP CONSTRAINT IF EXISTS push_subscriptions_keys_check,
  DROP CONSTRAINT IF EXISTS push_subscriptions_provider_check;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_endpoint_length_check
    CHECK (char_length(endpoint) BETWEEN 1 AND 4096) NOT VALID,
  ADD CONSTRAINT push_subscriptions_payload_size_check
    CHECK (octet_length(subscription::TEXT) <= 16384) NOT VALID,
  ADD CONSTRAINT push_subscriptions_endpoint_match_check
    CHECK (subscription ->> 'endpoint' = endpoint) NOT VALID,
  ADD CONSTRAINT push_subscriptions_keys_check
    CHECK (
      char_length(COALESCE(subscription #>> '{keys,p256dh}', '')) BETWEEN 16 AND 1024
      AND char_length(COALESCE(subscription #>> '{keys,auth}', '')) BETWEEN 8 AND 512
    ) NOT VALID,
  ADD CONSTRAINT push_subscriptions_provider_check
    CHECK (
      endpoint ~* '^https://(fcm[.]googleapis[.]com|android[.]googleapis[.]com|web[.]push[.]apple[.]com|([a-z0-9-]+[.])*push[.]services[.]mozilla[.]com|([a-z0-9-]+[.])*notify[.]windows[.]com)/'
    ) NOT VALID;

DROP POLICY IF EXISTS "Users manage their own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Active users manage their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Active users manage their own push subscriptions"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (
    auth.uid() = user_id
    AND public.current_personnel_id() IS NOT NULL
  )
  WITH CHECK (
    auth.uid() = user_id
    AND public.current_personnel_id() IS NOT NULL
  );

CREATE OR REPLACE FUNCTION public.enforce_push_subscription_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'A push subscription must belong to the signed-in account.';
  END IF;

  IF TG_OP = 'INSERT'
    AND NOT EXISTS (
      SELECT 1 FROM public.push_subscriptions
      WHERE user_id = NEW.user_id AND endpoint = NEW.endpoint
    )
    AND (
      SELECT COUNT(*) FROM public.push_subscriptions WHERE user_id = NEW.user_id
    ) >= 5 THEN
    RAISE EXCEPTION 'A maximum of five notification devices is allowed per account.';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_push_subscription_rules_trigger ON public.push_subscriptions;
CREATE TRIGGER enforce_push_subscription_rules_trigger
  BEFORE INSERT OR UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_push_subscription_rules();

-- Stored links must be normal web URLs even when an Officer writes directly
-- through the API instead of using the browser form.
ALTER TABLE public.arc_resources
  DROP CONSTRAINT IF EXISTS arc_resources_web_url_check;
ALTER TABLE public.arc_resources
  ADD CONSTRAINT arc_resources_web_url_check
  CHECK (url IS NULL OR url ~* '^https?://') NOT VALID;

ALTER TABLE public.arc_announcements
  DROP CONSTRAINT IF EXISTS arc_announcements_web_url_check;
ALTER TABLE public.arc_announcements
  ADD CONSTRAINT arc_announcements_web_url_check
  CHECK (external_url IS NULL OR external_url ~* '^https?://') NOT VALID;

COMMIT;
