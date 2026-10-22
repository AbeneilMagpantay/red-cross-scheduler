-- One attendance row per duty. Double taps on Check In created duplicates, so
-- first merge each set into its earliest row (earliest check-in, latest
-- check-out), then enforce uniqueness.

BEGIN;

-- enforce_attendance_rules only lets admins or the service role change rows.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY schedule_id ORDER BY created_at, id) AS position,
    COUNT(*) OVER (PARTITION BY schedule_id) AS copies,
    MIN(check_in) OVER (PARTITION BY schedule_id) AS first_check_in,
    MAX(check_out) OVER (PARTITION BY schedule_id) AS last_check_out
  FROM public.attendance
)
UPDATE public.attendance AS attendance
SET check_in = ranked.first_check_in,
    check_out = ranked.last_check_out
FROM ranked
WHERE attendance.id = ranked.id
  AND ranked.position = 1
  AND ranked.copies > 1;

DELETE FROM public.attendance AS attendance
USING (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY schedule_id ORDER BY created_at, id) AS position
  FROM public.attendance
) AS ranked
WHERE attendance.id = ranked.id
  AND ranked.position > 1;

-- The unique index also serves the lookups idx_attendance_schedule handled.
DROP INDEX IF EXISTS public.idx_attendance_schedule;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_one_per_schedule ON public.attendance (schedule_id);

COMMIT;
