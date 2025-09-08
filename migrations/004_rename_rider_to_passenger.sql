-- Migration: 004_rename_rider_to_passenger.sql
-- Description: Rename all 'rider' references to 'passenger' for consistency
-- Created: 2025-01-27

-- =============================================
-- RENAME TABLES
-- =============================================

-- Rename rider_profiles to passenger_profiles
ALTER TABLE public.rider_profiles RENAME TO passenger_profiles;

-- =============================================
-- UPDATE FOREIGN KEY CONSTRAINTS
-- =============================================

-- Drop the old foreign key constraint
ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS fk_trips_rider;

-- Add the new foreign key constraint with passenger naming
ALTER TABLE public.trips 
ADD CONSTRAINT fk_trips_passenger_profile FOREIGN KEY (rider_id) REFERENCES public.passenger_profiles(id);

-- =============================================
-- UPDATE INDEXES
-- =============================================

-- Rename indexes for passenger_profiles
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_rider_profiles_user_id') THEN
        ALTER INDEX idx_rider_profiles_user_id RENAME TO idx_passenger_profiles_user_id;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_rider_profiles_rating_avg') THEN
        ALTER INDEX idx_rider_profiles_rating_avg RENAME TO idx_passenger_profiles_rating_avg;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_rider_profiles_total_trips') THEN
        ALTER INDEX idx_rider_profiles_total_trips RENAME TO idx_passenger_profiles_total_trips;
    END IF;
END $$;

-- Handle trips indexes (there might be both rider and passenger indexes)
DO $$
BEGIN
    -- Drop the old rider index if it exists
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_trips_rider_id') THEN
        DROP INDEX idx_trips_rider_id;
    END IF;
    
    -- Rename passenger_id index to passenger_profile_id if it exists
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_trips_passenger_id') THEN
        ALTER INDEX idx_trips_passenger_id RENAME TO idx_trips_passenger_profile_id;
    END IF;
END $$;

-- =============================================
-- UPDATE COMMENTS
-- =============================================

-- Update table comment
COMMENT ON TABLE public.passenger_profiles IS 'Passenger-specific profile information';

-- Update column comments
COMMENT ON COLUMN public.passenger_profiles.preferred_payment_method IS 'Passenger preferred payment method';
COMMENT ON COLUMN public.passenger_profiles.emergency_contact_name IS 'Emergency contact person name';
COMMENT ON COLUMN public.passenger_profiles.emergency_contact_phone IS 'Emergency contact phone number';

-- =============================================
-- UPDATE TRIGGERS
-- =============================================

-- Rename trigger
ALTER TRIGGER update_rider_profiles_updated_at ON public.passenger_profiles 
RENAME TO update_passenger_profiles_updated_at;

-- =============================================
-- UPDATE ROLES
-- =============================================

-- Update role descriptions to use 'passenger' instead of 'rider'
UPDATE public.roles 
SET description = 'Passenger User' 
WHERE name = 'passenger';

-- =============================================
-- ADD MISSING COLUMNS TO PASSENGER_PROFILES
-- =============================================

-- Add missing columns that were in the original schema
ALTER TABLE public.passenger_profiles 
ADD COLUMN IF NOT EXISTS preferred_payment_method text CHECK (preferred_payment_method IN ('wallet', 'cash', 'card')),
ADD COLUMN IF NOT EXISTS emergency_contact_name text,
ADD COLUMN IF NOT EXISTS emergency_contact_phone text;

-- =============================================
-- UPDATE TRIPS TABLE COLUMN NAMES
-- =============================================

-- Rename rider_id to passenger_profile_id for clarity
ALTER TABLE public.trips RENAME COLUMN rider_id TO passenger_profile_id;

-- Update the foreign key constraint name
ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS fk_trips_passenger_profile;
ALTER TABLE public.trips 
ADD CONSTRAINT fk_trips_passenger_profile FOREIGN KEY (passenger_profile_id) REFERENCES public.passenger_profiles(id);

-- Rename the index
ALTER INDEX IF EXISTS idx_trips_passenger_profile_id RENAME TO idx_trips_passenger_profile_id;

-- =============================================
-- UPDATE SUPPORT TICKETS
-- =============================================

-- Update support tickets to use 'passenger' instead of 'rider'
UPDATE public.roles 
SET permissions = '["ticket:read", "ticket:update", "user:read"]' 
WHERE name = 'support';

-- =============================================
-- ADD AUDIT LOGGING FOR RENAMING
-- =============================================

-- Log the schema changes
INSERT INTO public.audit_logs (action, entity, details, created_at) VALUES
('schema_update', 'database', '{"changes": ["renamed rider_profiles to passenger_profiles", "updated all rider references to passenger", "renamed rider_id to passenger_profile_id in trips table"]}', now());
