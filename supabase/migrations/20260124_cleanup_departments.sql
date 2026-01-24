-- Remove legacy departments that have been replaced by Batch Names
DELETE FROM departments 
WHERE name IN (
    'Administration',
    'Blood Services',
    'Community Health',
    'Disaster Management',
    'Emergency Response',
    'Youth & Volunteer Services'
);
