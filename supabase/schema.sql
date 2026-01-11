-- =============================================
-- RED CROSS CAMARINES SUR SCHEDULING SYSTEM
-- Database Schema for Supabase
-- =============================================

-- Run this SQL in your Supabase SQL Editor to create the database structure

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- DEPARTMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default departments for Red Cross
INSERT INTO departments (name) VALUES 
  ('Emergency Response'),
  ('Blood Services'),
  ('Disaster Management'),
  ('Community Health'),
  ('Youth & Volunteer Services'),
  ('Administration');

-- =============================================
-- PERSONNEL TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS personnel (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(50),
  role VARCHAR(50) DEFAULT 'volunteer' CHECK (role IN ('admin', 'staff', 'volunteer')),
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_personnel_role ON personnel(role);
CREATE INDEX idx_personnel_department ON personnel(department_id);

-- =============================================
-- SCHEDULES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  personnel_id UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  duty_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX idx_schedules_date ON schedules(duty_date);
CREATE INDEX idx_schedules_personnel ON schedules(personnel_id);

-- =============================================
-- ATTENDANCE TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  personnel_id UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  check_in TIMESTAMP WITH TIME ZONE,
  check_out TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('present', 'late', 'absent', 'excused', 'pending')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_attendance_schedule ON attendance(schedule_id);
CREATE INDEX idx_attendance_personnel ON attendance(personnel_id);

-- =============================================
-- SWAP REQUESTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS swap_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_swap_status ON swap_requests(status);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE swap_requests ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users (allow all for now - can be made more restrictive)
CREATE POLICY "Allow all for authenticated users" ON departments FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON personnel FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON schedules FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON attendance FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON swap_requests FOR ALL USING (true);

-- =============================================
-- SAMPLE DATA (Optional - for testing)
-- =============================================

-- Insert a sample admin user (you'll create the auth user in Supabase dashboard)
-- After creating auth user, update the ID below and uncomment:

-- INSERT INTO personnel (id, name, email, role, is_active) VALUES 
--   ('YOUR-AUTH-USER-UUID', 'Admin User', 'admin@redcross.org', 'admin', true);
