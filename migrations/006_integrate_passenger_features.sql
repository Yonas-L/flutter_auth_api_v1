-- Migration: 006_integrate_passenger_features.sql
-- Description: Integrate passenger-side features into existing main database tables
-- Created: 2025-01-27

-- =============================================
-- REMOVE SEPARATE RIDES TABLE
-- =============================================

-- Drop the separate rides table since we're using trips as the main table
DROP TABLE IF EXISTS public.rides CASCADE;

-- =============================================
-- UPDATE TRIPS TABLE TO INCLUDE PASSENGER FEATURES
-- =============================================

-- Add passenger-specific columns to trips table
ALTER TABLE public.trips 
ADD COLUMN IF NOT EXISTS trip_reference text UNIQUE,
ADD COLUMN IF NOT EXISTS driver_details text, -- Store driver info as JSON string for passenger backend compatibility
ADD COLUMN IF NOT EXISTS selected_vehicle_details text, -- Store selected vehicle info as JSON string
ADD COLUMN IF NOT EXISTS trip_notes text,
ADD COLUMN IF NOT EXISTS special_requirements text,
ADD COLUMN IF NOT EXISTS estimated_wait_time_minutes integer DEFAULT 5 CHECK (estimated_wait_time_minutes >= 0),
ADD COLUMN IF NOT EXISTS actual_wait_time_minutes integer CHECK (actual_wait_time_minutes >= 0),
ADD COLUMN IF NOT EXISTS surge_multiplier numeric DEFAULT 1.0 CHECK (surge_multiplier >= 1.0),
ADD COLUMN IF NOT EXISTS discount_cents bigint DEFAULT 0 CHECK (discount_cents >= 0),
ADD COLUMN IF NOT EXISTS tip_cents bigint DEFAULT 0 CHECK (tip_cents >= 0),
ADD COLUMN IF NOT EXISTS platform_fee_cents bigint DEFAULT 0 CHECK (platform_fee_cents >= 0),
ADD COLUMN IF NOT EXISTS cancellation_fee_cents bigint DEFAULT 0 CHECK (cancellation_fee_cents >= 0);

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_trips_trip_reference ON public.trips(trip_reference);
CREATE INDEX IF NOT EXISTS idx_trips_estimated_wait_time ON public.trips(estimated_wait_time_minutes);
CREATE INDEX IF NOT EXISTS idx_trips_surge_multiplier ON public.trips(surge_multiplier);

-- =============================================
-- UPDATE VEHICLE_TYPES FOR PASSENGER COMPATIBILITY
-- =============================================

-- Add passenger-specific columns to vehicle_types
ALTER TABLE public.vehicle_types 
ADD COLUMN IF NOT EXISTS base_fare numeric, -- For passenger backend compatibility (in ETB)
ADD COLUMN IF NOT EXISTS price_per_km numeric, -- For passenger backend compatibility (in ETB)
ADD COLUMN IF NOT EXISTS wait_time_per_minute_cents bigint DEFAULT 0 CHECK (wait_time_per_minute_cents >= 0),
ADD COLUMN IF NOT EXISTS minimum_fare_cents bigint DEFAULT 0 CHECK (minimum_fare_cents >= 0),
ADD COLUMN IF NOT EXISTS maximum_fare_cents bigint CHECK (maximum_fare_cents >= 0),
ADD COLUMN IF NOT EXISTS is_available boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS requires_license boolean DEFAULT true;

-- Update base_fare and price_per_km to match passenger backend expectations
UPDATE public.vehicle_types 
SET base_fare = base_fare_cents / 100.0,
    price_per_km = price_per_km_cents / 100.0
WHERE base_fare IS NULL OR price_per_km IS NULL;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_vehicle_types_base_fare ON public.vehicle_types(base_fare);
CREATE INDEX IF NOT EXISTS idx_vehicle_types_price_per_km ON public.vehicle_types(price_per_km);
CREATE INDEX IF NOT EXISTS idx_vehicle_types_is_available ON public.vehicle_types(is_available);

-- =============================================
-- UPDATE USERS TABLE FOR PASSENGER FEATURES
-- =============================================

-- Add passenger-specific columns to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS otp text,
ADD COLUMN IF NOT EXISTS otp_expires_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS preferred_language text DEFAULT 'en',
ADD COLUMN IF NOT EXISTS notification_preferences text DEFAULT 'all' CHECK (notification_preferences IN ('all', 'trips_only', 'none')),
ADD COLUMN IF NOT EXISTS emergency_contact_name text,
ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
ADD COLUMN IF NOT EXISTS date_of_birth date,
ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male', 'female', 'other'));

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_users_otp ON public.users(otp);
CREATE INDEX IF NOT EXISTS idx_users_otp_expires_at ON public.users(otp_expires_at);
CREATE INDEX IF NOT EXISTS idx_users_preferred_language ON public.users(preferred_language);
CREATE INDEX IF NOT EXISTS idx_users_notification_preferences ON public.users(notification_preferences);

-- =============================================
-- UPDATE NOTIFICATIONS FOR PASSENGER FEATURES
-- =============================================

-- Add passenger-specific columns to notifications
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS notification_category text DEFAULT 'general' CHECK (notification_category IN ('general', 'trip', 'payment', 'promotion', 'system', 'safety')),
ADD COLUMN IF NOT EXISTS is_silent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed'));

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_notifications_category ON public.notifications(notification_category);
CREATE INDEX IF NOT EXISTS idx_notifications_is_silent ON public.notifications(is_silent);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_at ON public.notifications(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notifications_delivery_status ON public.notifications(delivery_status);

-- =============================================
-- UPDATE WALLET_ACCOUNTS FOR PASSENGER FEATURES
-- =============================================

-- Add passenger-specific columns to wallet_accounts
ALTER TABLE public.wallet_accounts 
ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'personal' CHECK (account_type IN ('personal', 'business')),
ADD COLUMN IF NOT EXISTS daily_limit_cents bigint DEFAULT 100000 CHECK (daily_limit_cents >= 0),
ADD COLUMN IF NOT EXISTS monthly_limit_cents bigint DEFAULT 1000000 CHECK (monthly_limit_cents >= 0),
ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_level text DEFAULT 'basic' CHECK (verification_level IN ('basic', 'intermediate', 'advanced')),
ADD COLUMN IF NOT EXISTS last_transaction_at timestamp with time zone;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_wallet_accounts_account_type ON public.wallet_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_wallet_accounts_is_verified ON public.wallet_accounts(is_verified);
CREATE INDEX IF NOT EXISTS idx_wallet_accounts_verification_level ON public.wallet_accounts(verification_level);
CREATE INDEX IF NOT EXISTS idx_wallet_accounts_last_transaction_at ON public.wallet_accounts(last_transaction_at);

-- =============================================
-- UPDATE WALLET_TRANSACTIONS FOR PASSENGER FEATURES
-- =============================================

-- Add passenger-specific columns to wallet_transactions
ALTER TABLE public.wallet_transactions 
ADD COLUMN IF NOT EXISTS transaction_category text DEFAULT 'general' CHECK (transaction_category IN ('general', 'trip_payment', 'trip_earning', 'refund', 'bonus', 'penalty')),
ADD COLUMN IF NOT EXISTS payment_method text CHECK (payment_method IN ('cash', 'wallet', 'card', 'bank_transfer', 'mobile_money')),
ADD COLUMN IF NOT EXISTS payment_gateway text,
ADD COLUMN IF NOT EXISTS gateway_transaction_id text,
ADD COLUMN IF NOT EXISTS is_reversible boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS reversal_deadline timestamp with time zone;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_category ON public.wallet_transactions(transaction_category);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_payment_method ON public.wallet_transactions(payment_method);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_gateway_transaction_id ON public.wallet_transactions(gateway_transaction_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_is_reversible ON public.wallet_transactions(is_reversible);

-- =============================================
-- UPDATE SUPPORT_TICKETS FOR PASSENGER FEATURES
-- =============================================

-- Add passenger-specific columns to support_tickets
ALTER TABLE public.support_tickets 
ADD COLUMN IF NOT EXISTS ticket_priority_score integer DEFAULT 0 CHECK (ticket_priority_score >= 0),
ADD COLUMN IF NOT EXISTS resolution_notes text,
ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS last_response_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS response_count integer DEFAULT 0 CHECK (response_count >= 0),
ADD COLUMN IF NOT EXISTS satisfaction_rating smallint CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5),
ADD COLUMN IF NOT EXISTS is_escalated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS escalation_reason text;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority_score ON public.support_tickets(ticket_priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_closed_at ON public.support_tickets(closed_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_last_response_at ON public.support_tickets(last_response_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_satisfaction_rating ON public.support_tickets(satisfaction_rating);
CREATE INDEX IF NOT EXISTS idx_support_tickets_is_escalated ON public.support_tickets(is_escalated);

-- =============================================
-- UPDATE FAVORITE_PLACES FOR PASSENGER FEATURES
-- =============================================

-- Add passenger-specific columns to favorite_places
ALTER TABLE public.favorite_places 
ADD COLUMN IF NOT EXISTS place_type text DEFAULT 'general' CHECK (place_type IN ('general', 'home', 'work', 'frequent', 'custom')),
ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS visit_count integer DEFAULT 0 CHECK (visit_count >= 0),
ADD COLUMN IF NOT EXISTS last_used_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS is_shared boolean DEFAULT false;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_favorite_places_place_type ON public.favorite_places(place_type);
CREATE INDEX IF NOT EXISTS idx_favorite_places_is_primary ON public.favorite_places(is_primary);
CREATE INDEX IF NOT EXISTS idx_favorite_places_visit_count ON public.favorite_places(visit_count DESC);
CREATE INDEX IF NOT EXISTS idx_favorite_places_last_used_at ON public.favorite_places(last_used_at DESC);

-- =============================================
-- ADD COMMENTS FOR NEW COLUMNS
-- =============================================

-- Trips table comments
COMMENT ON COLUMN public.trips.trip_reference IS 'Unique trip reference for passenger backend compatibility';
COMMENT ON COLUMN public.trips.driver_details IS 'Driver information stored as JSON string for passenger backend';
COMMENT ON COLUMN public.trips.selected_vehicle_details IS 'Selected vehicle information stored as JSON string';
COMMENT ON COLUMN public.trips.trip_notes IS 'Additional notes about the trip';
COMMENT ON COLUMN public.trips.special_requirements IS 'Special requirements for the trip';
COMMENT ON COLUMN public.trips.estimated_wait_time_minutes IS 'Estimated wait time for driver arrival';
COMMENT ON COLUMN public.trips.actual_wait_time_minutes IS 'Actual wait time for driver arrival';
COMMENT ON COLUMN public.trips.surge_multiplier IS 'Surge pricing multiplier';
COMMENT ON COLUMN public.trips.discount_cents IS 'Discount applied in cents';
COMMENT ON COLUMN public.trips.tip_cents IS 'Tip amount in cents';
COMMENT ON COLUMN public.trips.platform_fee_cents IS 'Platform fee in cents';
COMMENT ON COLUMN public.trips.cancellation_fee_cents IS 'Cancellation fee in cents';

-- Vehicle types comments
COMMENT ON COLUMN public.vehicle_types.base_fare IS 'Base fare in ETB for passenger backend compatibility';
COMMENT ON COLUMN public.vehicle_types.price_per_km IS 'Price per kilometer in ETB for passenger backend compatibility';
COMMENT ON COLUMN public.vehicle_types.wait_time_per_minute_cents IS 'Cost per minute of waiting time in cents';
COMMENT ON COLUMN public.vehicle_types.minimum_fare_cents IS 'Minimum fare in cents';
COMMENT ON COLUMN public.vehicle_types.maximum_fare_cents IS 'Maximum fare in cents';
COMMENT ON COLUMN public.vehicle_types.is_available IS 'Whether this vehicle type is currently available';
COMMENT ON COLUMN public.vehicle_types.requires_license IS 'Whether this vehicle type requires a special license';

-- Users table comments
COMMENT ON COLUMN public.users.otp IS 'One-time password for verification';
COMMENT ON COLUMN public.users.otp_expires_at IS 'When the OTP expires';
COMMENT ON COLUMN public.users.preferred_language IS 'User preferred language';
COMMENT ON COLUMN public.users.notification_preferences IS 'User notification preferences';
COMMENT ON COLUMN public.users.emergency_contact_name IS 'Emergency contact person name';
COMMENT ON COLUMN public.users.emergency_contact_phone IS 'Emergency contact phone number';
COMMENT ON COLUMN public.users.date_of_birth IS 'User date of birth';
COMMENT ON COLUMN public.users.gender IS 'User gender';

-- =============================================
-- ADD AUDIT LOGGING
-- =============================================

-- Log the schema changes
INSERT INTO public.audit_logs (action, entity, details, created_at) VALUES
('schema_update', 'database', '{"changes": ["integrated passenger features into main database tables", "removed separate rides table", "added passenger-specific columns to trips, users, vehicle_types", "maintained original main database structure"]}', now());
