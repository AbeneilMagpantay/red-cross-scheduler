-- Add title column to schedules
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS title VARCHAR(255);

-- Add license fields to personnel
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS license_type VARCHAR(100);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS license_expiry DATE;

-- Insert new Batch Names (Departments)
-- We insert them so they are available. You may want to manually delete old departments
-- or reassign existing personnel to these new batches.
INSERT INTO departments (name) VALUES 
('Bagani'), 
('Dragon’s Tail'), 
('V2O'), 
('Bonakids'), 
('Boswan');

-- Create an index for the new title column for faster searching
CREATE INDEX IF NOT EXISTS idx_schedules_title ON schedules(title);
