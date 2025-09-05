-- Migration: Add real-time tracking fields to driver_profiles
-- Purpose: Enable real-time location tracking and trip management
-- Date: 2025-01-09
-- Safe: Only adds new columns with defaults, no data loss

-- Add location tracking fields
ALTER TABLE public.driver_profiles 
ADD COLUMN IF NOT EXISTS last_known_location GEOGRAPHY(POINT, 4326),
ADD COLUMN IF NOT EXISTS last_location_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS current_trip_id UUID,
ADD COLUMN IF NOT EXISTS socket_id TEXT;

-- Add foreign key constraint for current_trip_id
ALTER TABLE public.driver_profiles 
ADD CONSTRAINT fk_driver_current_trip 
FOREIGN KEY (current_trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_driver_profiles_location 
ON public.driver_profiles USING GIST (last_known_location);

CREATE INDEX IF NOT EXISTS idx_driver_profiles_location_update 
ON public.driver_profiles (last_location_update);

CREATE INDEX IF NOT EXISTS idx_driver_profiles_current_trip 
ON public.driver_profiles (current_trip_id);

CREATE INDEX IF NOT EXISTS idx_driver_profiles_socket 
ON public.driver_profiles (socket_id);

-- Add check constraints for data integrity
ALTER TABLE public.driver_profiles 
ADD CONSTRAINT check_location_update_recent 
CHECK (last_location_update IS NULL OR last_location_update >= created_at);

-- Add comments for documentation
COMMENT ON COLUMN public.driver_profiles.last_known_location IS 'Last known GPS location of the driver (PostGIS geography point)';
COMMENT ON COLUMN public.driver_profiles.last_location_update IS 'Timestamp of the last location update';
COMMENT ON COLUMN public.driver_profiles.current_trip_id IS 'ID of the currently active trip (if any)';
COMMENT ON COLUMN public.driver_profiles.socket_id IS 'Socket.IO connection ID for real-time communication';
