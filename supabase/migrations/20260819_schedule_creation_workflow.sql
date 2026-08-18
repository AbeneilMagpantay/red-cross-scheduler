-- Schedule creation wizard additions: separate organization/coordinator fields,
-- team-member roles, and explicit admin permission to delete past events.

BEGIN;

ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS organization TEXT,
  ADD COLUMN IF NOT EXISTS coordinator TEXT,
  ADD COLUMN IF NOT EXISTS assignment_role TEXT;

-- The existing assignment-protection trigger intentionally rejects updates to
-- concluded duties. Temporarily disable only that trigger while copying this
-- legacy event metadata; the surrounding transaction guarantees it is restored
-- if the backfill fails.
ALTER TABLE schedules DISABLE TRIGGER enforce_schedule_assignment_rules_trigger;

UPDATE schedules
SET organization = organization_event_head
WHERE organization IS NULL
  AND organization_event_head IS NOT NULL;

ALTER TABLE schedules ENABLE TRIGGER enforce_schedule_assignment_rules_trigger;

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
    NEW.team_station := NULL;
    NEW.assignment_role := NULL;
    RETURN NEW;
  END IF;

  target_schedule := OLD;

  -- Admins may intentionally remove an entire past event from the Schedule.
  -- The foreign-key cascades also remove its linked attendance/swap records.
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
