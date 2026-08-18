-- Persistent duty teams. Teams exist independently from volunteer assignments,
-- so admins can prepare empty teams and fill them after registration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.duty_teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL,
  event_anchor_id UUID NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_duty_teams_event_id
  ON public.duty_teams(event_id, sort_order);

ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.duty_teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schedules_team_id
  ON public.schedules(team_id);

-- Preserve teams that were previously represented only by team_station text.
WITH legacy_team_names AS (
  SELECT
    schedule.event_id,
    BTRIM(schedule.team_station) AS name,
    MIN(schedule.created_at) AS first_created_at
  FROM public.schedules AS schedule
  WHERE schedule.event_id IS NOT NULL
    AND NULLIF(BTRIM(schedule.team_station), '') IS NOT NULL
  GROUP BY schedule.event_id, BTRIM(schedule.team_station)
), legacy_teams AS (
  SELECT
    event_id,
    name,
    (ROW_NUMBER() OVER (
      PARTITION BY event_id
      ORDER BY first_created_at, name
    ) - 1)::INTEGER AS sort_order
  FROM legacy_team_names
), anchors AS (
  SELECT DISTINCT ON (event_id) event_id, id
  FROM public.schedules
  WHERE event_id IS NOT NULL
  ORDER BY event_id, (is_event_anchor = TRUE) DESC, created_at
)
INSERT INTO public.duty_teams (event_id, event_anchor_id, name, sort_order)
SELECT legacy.event_id, anchor.id, legacy.name, legacy.sort_order
FROM legacy_teams AS legacy
JOIN anchors AS anchor ON anchor.event_id = legacy.event_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.duty_teams AS existing
  WHERE existing.event_id = legacy.event_id
    AND existing.name = legacy.name
);

ALTER TABLE public.schedules DISABLE TRIGGER enforce_schedule_assignment_rules_trigger;

UPDATE public.schedules AS schedule
SET team_id = team.id
FROM public.duty_teams AS team
WHERE schedule.team_id IS NULL
  AND schedule.event_id = team.event_id
  AND NULLIF(BTRIM(schedule.team_station), '') = team.name;

ALTER TABLE public.schedules ENABLE TRIGGER enforce_schedule_assignment_rules_trigger;

ALTER TABLE public.duty_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view duty teams" ON public.duty_teams;
DROP POLICY IF EXISTS "Admins can manage duty teams" ON public.duty_teams;

CREATE POLICY "Authenticated users can view duty teams"
  ON public.duty_teams FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Admins can manage duty teams"
  ON public.duty_teams FOR ALL TO authenticated
  USING (public.current_personnel_is_admin())
  WITH CHECK (public.current_personnel_is_admin());

CREATE OR REPLACE FUNCTION public.enforce_duty_team_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  team_event_id UUID;
  source_event schedules%ROWTYPE;
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF NOT public.current_personnel_is_admin() THEN
    RAISE EXCEPTION 'Only administrators can manage duty teams.';
  END IF;

  -- Allow the foreign-key cascade after the event anchor itself is deleted,
  -- including when an admin removes a concluded event.
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM schedules WHERE id = OLD.event_anchor_id
  ) THEN
    RETURN OLD;
  END IF;

  team_event_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.event_id ELSE NEW.event_id END;

  SELECT *
  INTO source_event
  FROM schedules
  WHERE event_id = team_event_id
  ORDER BY (is_event_anchor = TRUE) DESC, created_at
  LIMIT 1;

  -- If the anchor is already gone, this is the cascade from deleting an event.
  IF source_event.id IS NOT NULL
    AND public.schedule_event_is_concluded(source_event.event_id, source_event.duty_date, source_event.end_time) THEN
    RAISE EXCEPTION 'Teams for concluded events can no longer be changed.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_duty_team_rules_trigger ON public.duty_teams;
CREATE TRIGGER enforce_duty_team_rules_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.duty_teams
  FOR EACH ROW EXECUTE FUNCTION public.enforce_duty_team_rules();

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
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.team_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM duty_teams
    WHERE id = NEW.team_id
      AND event_id = NEW.event_id
  ) THEN
    RAISE EXCEPTION 'The selected team does not belong to this event.';
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

  IF TG_OP = 'DELETE' AND actor_is_admin THEN
    RETURN OLD;
  END IF;

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
    IF actor_id IS NULL OR OLD.personnel_id IS DISTINCT FROM actor_id THEN
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
      NEW.team_id,
      NEW.team_station,
      NEW.assignment_role,
      NEW.organization_event_head,
      NEW.organization,
      NEW.coordinator,
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
      OLD.team_id,
      OLD.team_station,
      OLD.assignment_role,
      OLD.organization_event_head,
      OLD.organization,
      OLD.coordinator,
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

COMMIT;
