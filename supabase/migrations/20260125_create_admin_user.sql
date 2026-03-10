-- =================================================================
-- FIX FOR "ACCESS DENIED" / "NO PERSONNEL RECORD" ISSUE
-- =================================================================
-- The application requires a linked record in the 'personnel' table 
-- matching your Supabase Auth account. Since we don't have auto-triggers
-- set up yet, you need to run this manually for your first admin user.

-- INSTRUCTIONS:
-- 1. Replace 'YOUR_EMAIL_HERE' below with the exact email you used to Login/Sign Up.
-- 2. Run this entire script in the Supabase SQL Editor.

INSERT INTO public.personnel (id, name, email, role, is_active)
SELECT 
  id,               -- Copies the UUID from auth.users
  'Admin User',     -- Default Name (you can change this)
  email, 
  'admin',          -- Grants Admin privileges
  true
FROM auth.users
WHERE email = 'YOUR_EMAIL_HERE'  -- <--- CHANGE THIS TO YOUR EMAIL
ON CONFLICT (email) DO NOTHING;  -- Prevents errors if run twice
