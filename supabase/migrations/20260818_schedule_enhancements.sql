-- Schedule V2: stable event groups, richer event details, reminders, and safer self-service editing.

BEGIN;

ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS event_id UUID,
  ADD COLUMN IF NOT EXISTS precise_location TEXT,
  ADD COLUMN IF NOT EXISTS meetup_place TEXT,
  ADD COLUMN IF NOT EXISTS team_station TEXT,
  ADD COLUMN IF NOT EXISTS organization_event_head TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS reminder_offsets INTEGER[] NOT NULL DEFAULT ARRAY[1440, 120],
  ADD COLUMN IF NOT EXISTS is_event_anchor BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing rows that represented the same titled event on the same day receive
-- the same event ID. Untitled duties intentionally remain separate.
WITH event_groups AS (
  SELECT
    duty_date,
    COALESCE(
      NULLIF(regexp_replace(lower(trim(title)), '\s+', ' ', 'g'), ''),
      id::TEXT
    ) AS event_key,
    uuid_generate_v4() AS generated_event_id
  FROM schedules
  WHERE event_id IS NULL
  GROUP BY
    duty_date,
    COALESCE(
      NULLIF(regexp_replace(lower(trim(title)), '\s+', ' ', 'g'), ''),
      id::TEXT
    )
)
UPDATE schedules AS schedule
SET event_id = event_groups.generated_event_id
FROM event_groups
WHERE schedule.event_id IS NULL
  AND schedule.duty_date = event_groups.duty_date
  AND COALESCE(
    NULLIF(regexp_replace(lower(trim(schedule.title)), '\s+', ' ', 'g'), ''),
    schedule.id::TEXT
  ) = event_groups.event_key;

ALTER TABLE schedules
  ALTER COLUMN event_id SET DEFAULT uuid_generate_v4(),
  ALTER COLUMN event_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schedules_event_id ON schedules(event_id);
CREATE INDEX IF NOT EXISTS idx_schedules_event_date ON schedules(event_id, duty_date);

-- Keep one personnel-free anchor row per event so the event itself remains in
-- the calendar even if every volunteer unregisters.
WITH existing_anchors AS (
  SELECT DISTINCT ON (event_id) id
  FROM schedules
  WHERE personnel_id IS NULL
  ORDER BY event_id, created_at, id
)
UPDATE schedules
SET is_event_anchor = TRUE
WHERE id IN (SELECT id FROM existing_anchors);

INSERT INTO schedules (
  event_id,
  personnel_id,
  duty_date,
  start_time,
  end_time,
  notes,
  title,
  is_deployment_event,
  precise_location,
  meetup_place,
  team_station,
  organization_event_head,
  contact_person,
  contact_number,
  reminder_offsets,
  is_event_anchor,
  created_at,
  updated_at
)
SELECT
  source.event_id,
  NULL,
  source.duty_date,
  source.start_time,
  source.end_time,
  NULL,
  source.title,
  source.is_deployment_event,
  source.precise_location,
  source.meetup_place,
  NULL,
  source.organization_event_head,
  source.contact_person,
  source.contact_number,
  source.reminder_offsets,
  TRUE,
  source.created_at,
  source.updated_at
FROM (
  SELECT DISTINCT ON (event_id) *
  FROM schedules
  ORDER BY event_id, created_at, id
) AS source
WHERE NOT EXISTS (
  SELECT 1
  FROM schedules AS anchor
  WHERE anchor.event_id = source.event_id
    AND anchor.is_event_anchor = TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_one_event_anchor
  ON schedules(event_id)
  WHERE is_event_anchor = TRUE;

-- Each sent reminder is recorded so a scheduled job can safely run repeatedly.
CREATE TABLE IF NOT EXISTS duty_reminder_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_minutes INTEGER NOT NULL CHECK (reminder_minutes > 0),
  delivered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (schedule_id, user_id, reminder_minutes)
);

ALTER TABLE duty_reminder_deliveries ENABLE ROW LEVEL SECURITY;

-- Resolve restored/Google-linked profiles by ID first and email second.
CREATE OR REPLACE FUNCTION public.current_personnel_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT personnel.id
  FROM personnel
  WHERE personnel.is_active = TRUE
    AND (
      personnel.id = auth.uid()
      OR lower(personnel.email) = lower(auth.jwt() ->> 'email')
    )
  ORDER BY CASE WHEN personnel.id = auth.uid() THEN 0 ELSE 1 END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_personnel_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT personnel.role = 'admin'
    FROM personnel
    WHERE personnel.id = public.current_personnel_id()
    LIMIT 1
  ), FALSE);
$$;

REVOKE ALL ON FUNCTION public.current_personnel_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_personnel_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_personnel_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_personnel_is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.schedule_event_is_concluded(
  target_event_id UUID,
  fallback_date DATE,
  fallback_end TIME
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  local_now TIMESTAMP := timezone('Asia/Manila', NOW());
  event_ends_at TIMESTAMP;
BEGIN
  SELECT MAX(
    fallback_date + COALESCE(end_time, fallback_end, TIME '23:59')
    + CASE
        WHEN COALESCE(end_time, fallback_end, TIME '23:59') < COALESCE(start_time, TIME '00:00')
          THEN INTERVAL '1 day'
        ELSE INTERVAL '0 days'
      END
  )
  INTO event_ends_at
  FROM schedules
  WHERE event_id = target_event_id;

  event_ends_at := COALESCE(
    event_ends_at,
    fallback_date + COALESCE(fallback_end, TIME '23:59')
  );

  RETURN event_ends_at < local_now;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_event_is_concluded(UUID, DATE, TIME) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_event_is_concluded(UUID, DATE, TIME) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_schedule_assignment_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := public.current_personnel_id();
  actor_is_admin BOOLEAN := public.current_personnel_is_admin();
  source_event schedules%ROWTYPE;
  target_schedule schedules%ROWTYPE;
BEGIN
  -- Trusted backend jobs use the service role and are already protected by their
  -- own credentials. Human users continue through the checks below.
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF actor_is_admin THEN
      RETURN NEW;
    END IF;

    IF actor_id IS NULL OR NEW.personnel_id IS DISTINCT FROM actor_id THEN
      RAISE EXCEPTION 'You can only register yourself for an event.';
    END IF;

    SELECT *
    INTO source_event
    FROM schedules
    WHERE event_id = NEW.event_id
    ORDER BY (personnel_id IS NULL) DESC, created_at
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

    -- A volunteer may choose only their own time and notes. Event-controlled
    -- fields are always copied from the existing event.
    NEW.duty_date := source_event.duty_date;
    NEW.title := source_event.title;
    NEW.precise_location := source_event.precise_location;
    NEW.meetup_place := source_event.meetup_place;
    NEW.organization_event_head := source_event.organization_event_head;
    NEW.contact_person := source_event.contact_person;
    NEW.contact_number := source_event.contact_number;
    NEW.reminder_offsets := source_event.reminder_offsets;
    NEW.is_deployment_event := source_event.is_deployment_event;
    NEW.is_event_anchor := FALSE;
    NEW.team_station := NULL;
    RETURN NEW;
  END IF;

  target_schedule := OLD;

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
    IF NOT actor_is_admin AND (actor_id IS NULL OR OLD.personnel_id IS DISTINCT FROM actor_id) THEN
      RAISE EXCEPTION 'You can only remove your own registration.';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT actor_is_admin THEN
    IF actor_id IS NULL OR OLD.personnel_id IS DISTINCT FROM actor_id THEN
      RAISE EXCEPTION 'You can only edit your own duty assignment.';
    END IF;

    IF ROW(
      NEW.id,
      NEW.event_id,
      NEW.personnel_id,
      NEW.duty_date,
      NEW.title,
      NEW.precise_location,
      NEW.meetup_place,
      NEW.team_station,
      NEW.organization_event_head,
      NEW.contact_person,
      NEW.contact_number,
      NEW.reminder_offsets,
      NEW.is_deployment_event,
      NEW.is_event_anchor,
      NEW.created_at
    ) IS DISTINCT FROM ROW(
      OLD.id,
      OLD.event_id,
      OLD.personnel_id,
      OLD.duty_date,
      OLD.title,
      OLD.precise_location,
      OLD.meetup_place,
      OLD.team_station,
      OLD.organization_event_head,
      OLD.contact_person,
      OLD.contact_number,
      OLD.reminder_offsets,
      OLD.is_deployment_event,
      OLD.is_event_anchor,
      OLD.created_at
    ) THEN
      RAISE EXCEPTION 'You may only edit your own time and notes.';
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_schedule_assignment_rules_trigger ON schedules;
CREATE TRIGGER enforce_schedule_assignment_rules_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON schedules
  FOR EACH ROW EXECUTE FUNCTION public.enforce_schedule_assignment_rules();

-- Replace the original unrestricted policy with role-aware access. Everyone can
-- still view the shared calendar; mutations are limited to admins or the owner.
DROP POLICY IF EXISTS "Allow all for authenticated users" ON schedules;
DROP POLICY IF EXISTS "Authenticated users can view schedules" ON schedules;
DROP POLICY IF EXISTS "Admins and owners can create schedules" ON schedules;
DROP POLICY IF EXISTS "Admins and owners can update schedules" ON schedules;
DROP POLICY IF EXISTS "Admins and owners can delete schedules" ON schedules;

CREATE POLICY "Authenticated users can view schedules"
  ON schedules FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Admins and owners can create schedules"
  ON schedules FOR INSERT TO authenticated
  WITH CHECK (
    public.current_personnel_is_admin()
    OR personnel_id = public.current_personnel_id()
  );

CREATE POLICY "Admins and owners can update schedules"
  ON schedules FOR UPDATE TO authenticated
  USING (
    public.current_personnel_is_admin()
    OR personnel_id = public.current_personnel_id()
  )
  WITH CHECK (
    public.current_personnel_is_admin()
    OR personnel_id = public.current_personnel_id()
  );

CREATE POLICY "Admins and owners can delete schedules"
  ON schedules FOR DELETE TO authenticated
  USING (
    public.current_personnel_is_admin()
    OR personnel_id = public.current_personnel_id()
  );

COMMIT;
