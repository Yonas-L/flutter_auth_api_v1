-- Migration: 009_add_delivery_trip_support.sql
-- Description: Add support for delivery trips with recipient_name and package_description
-- Created: 2025-11-06

-- =============================================
-- UPDATE TRIP_TYPE CONSTRAINT
-- =============================================

-- Drop the old constraint
ALTER TABLE public.trips 
DROP CONSTRAINT IF EXISTS trips_trip_type_check;

-- Add new constraint that includes 'delivery'
ALTER TABLE public.trips 
ADD CONSTRAINT trips_trip_type_check 
CHECK (trip_type IN ('standard', 'scheduled', 'shared', 'delivery'));

-- =============================================
-- ADD DELIVERY-SPECIFIC COLUMNS
-- =============================================

-- Add recipient_name column for delivery trips
ALTER TABLE public.trips 
ADD COLUMN IF NOT EXISTS recipient_name text;

-- Add package_description column for delivery trips
ALTER TABLE public.trips 
ADD COLUMN IF NOT EXISTS package_description text;

-- Add index for trip_type to improve query performance
CREATE INDEX IF NOT EXISTS idx_trips_trip_type_delivery ON public.trips(trip_type) WHERE trip_type = 'delivery';

-- Add comments for documentation
COMMENT ON COLUMN public.trips.recipient_name IS 'Name of the recipient for delivery trips (shown to driver instead of passenger_name)';
COMMENT ON COLUMN public.trips.package_description IS 'Description of package contents and handling instructions for delivery trips';

