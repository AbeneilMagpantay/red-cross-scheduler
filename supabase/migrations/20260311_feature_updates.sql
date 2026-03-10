-- =============================================
-- Feature Updates Migration - 2026-03-11
-- =============================================

-- 1. Add "dia5" batch to departments
INSERT INTO departments (name) 
SELECT 'dia5' 
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE name = 'dia5');

-- 2. Add reason column to swap_requests (for swap reason text)
ALTER TABLE swap_requests ADD COLUMN IF NOT EXISTS reason TEXT;

-- 3. Allow nullable personnel_id on schedules (for admin-created placeholder events)
ALTER TABLE schedules ALTER COLUMN personnel_id DROP NOT NULL;

-- 4. Add title column to schedules if not exists
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS title VARCHAR(255);
