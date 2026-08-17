-- Preserve schedules and attendance when personnel accounts are archived.
-- The application now uses personnel.is_active instead of deleting rows.

BEGIN;

COMMENT ON COLUMN personnel.is_active IS
  'Archived personnel have is_active = false. Keep their row so historical duty records retain the personnel name.';

-- Guard against direct personnel deletion while historical rows still refer to
-- the person. Archiving should be used instead of physical deletion.
ALTER TABLE schedules
  DROP CONSTRAINT IF EXISTS schedules_personnel_id_fkey;

ALTER TABLE schedules
  ADD CONSTRAINT schedules_personnel_id_fkey
  FOREIGN KEY (personnel_id)
  REFERENCES personnel(id)
  ON DELETE RESTRICT;

ALTER TABLE attendance
  DROP CONSTRAINT IF EXISTS attendance_personnel_id_fkey;

ALTER TABLE attendance
  ADD CONSTRAINT attendance_personnel_id_fkey
  FOREIGN KEY (personnel_id)
  REFERENCES personnel(id)
  ON DELETE RESTRICT;

COMMIT;
