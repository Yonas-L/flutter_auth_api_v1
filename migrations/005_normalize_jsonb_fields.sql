-- Migration: 005_normalize_jsonb_fields.sql
-- Description: Normalize JSONB fields to proper relational columns for better scalability
-- Created: 2025-01-27

-- =============================================
-- NORMALIZE TRIPS TABLE
-- =============================================

-- Add new columns to replace JSONB fields in trips table
ALTER TABLE public.trips 
ADD COLUMN IF NOT EXISTS trip_type text DEFAULT 'standard' CHECK (trip_type IN ('standard', 'scheduled', 'shared')),
ADD COLUMN IF NOT EXISTS passenger_count smallint DEFAULT 1 CHECK (passenger_count >= 1 AND passenger_count <= 8),
ADD COLUMN IF NOT EXISTS special_instructions text,
ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash' CHECK (payment_method IN ('cash', 'wallet', 'card')),
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
ADD COLUMN IF NOT EXISTS driver_earnings_cents bigint CHECK (driver_earnings_cents >= 0),
ADD COLUMN IF NOT EXISTS commission_cents bigint CHECK (commission_cents >= 0),
ADD COLUMN IF NOT EXISTS canceled_by_user_id uuid,
ADD COLUMN IF NOT EXISTS driver_assigned_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS driver_arrived_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS trip_started_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS trip_completed_at timestamp with time zone;

-- Add foreign key for canceled_by_user_id
ALTER TABLE public.trips 
ADD CONSTRAINT fk_trips_canceled_by FOREIGN KEY (canceled_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_trips_trip_type ON public.trips(trip_type);
CREATE INDEX IF NOT EXISTS idx_trips_payment_method ON public.trips(payment_method);
CREATE INDEX IF NOT EXISTS idx_trips_payment_status ON public.trips(payment_status);
CREATE INDEX IF NOT EXISTS idx_trips_driver_assigned_at ON public.trips(driver_assigned_at);
CREATE INDEX IF NOT EXISTS idx_trips_trip_started_at ON public.trips(trip_started_at);
CREATE INDEX IF NOT EXISTS idx_trips_trip_completed_at ON public.trips(trip_completed_at);

-- =============================================
-- NORMALIZE NOTIFICATIONS TABLE
-- =============================================

-- Add new columns to replace JSONB metadata in notifications
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS notification_type text DEFAULT 'general' CHECK (notification_type IN ('general', 'trip_update', 'payment', 'promotion', 'system')),
ADD COLUMN IF NOT EXISTS reference_id uuid,
ADD COLUMN IF NOT EXISTS reference_type text CHECK (reference_type IN ('trip', 'payment', 'user', 'system')),
ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
ADD COLUMN IF NOT EXISTS action_url text,
ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_notifications_notification_type ON public.notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_reference_id ON public.notifications(reference_id);
CREATE INDEX IF NOT EXISTS idx_notifications_reference_type ON public.notifications(reference_type);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON public.notifications(priority);
CREATE INDEX IF NOT EXISTS idx_notifications_expires_at ON public.notifications(expires_at);

-- =============================================
-- UPDATE VEHICLE_TYPES TABLE STRUCTURE
-- =============================================

-- Rename columns to match passenger backend expectations
ALTER TABLE public.vehicle_types 
RENAME COLUMN name TO type;

-- Add missing columns for passenger backend compatibility
ALTER TABLE public.vehicle_types 
ADD COLUMN IF NOT EXISTS display_name text,
ADD COLUMN IF NOT EXISTS capacity smallint DEFAULT 4 CHECK (capacity >= 1 AND capacity <= 20),
ADD COLUMN IF NOT EXISTS features text[],
ADD COLUMN IF NOT EXISTS estimated_wait_time_minutes integer DEFAULT 5 CHECK (estimated_wait_time_minutes >= 0);

-- Update display_name to match type if not set
UPDATE public.vehicle_types 
SET display_name = type 
WHERE display_name IS NULL;

-- =============================================
-- CREATE RIDES TABLE (for passenger backend compatibility)
-- =============================================

-- Create rides table that matches passenger backend structure
CREATE TABLE IF NOT EXISTS public.rides (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    rider_id uuid NOT NULL,
    driver_id text,
    driver_details text, -- Store as JSON string instead of JSONB
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'in_progress', 'completed', 'canceled')),
    trip_details text, -- Store as JSON string instead of JSONB
    selected_car text, -- Store as JSON string instead of JSONB
    request_timestamp timestamp with time zone,
    rating smallint CHECK (rating >= 1 AND rating <= 5),
    comment text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT rides_pkey PRIMARY KEY (id),
    CONSTRAINT fk_rides_rider FOREIGN KEY (rider_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Create indexes for rides table
CREATE INDEX IF NOT EXISTS idx_rides_rider_id ON public.rides(rider_id);
CREATE INDEX IF NOT EXISTS idx_rides_status ON public.rides(status);
CREATE INDEX IF NOT EXISTS idx_rides_request_timestamp ON public.rides(request_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_rides_created_at ON public.rides(created_at DESC);

-- =============================================
-- UPDATE WALLET_TRANSACTIONS TABLE
-- =============================================

-- Add new columns to replace JSONB metadata
ALTER TABLE public.wallet_transactions 
ADD COLUMN IF NOT EXISTS transaction_reference text,
ADD COLUMN IF NOT EXISTS external_reference_id text,
ADD COLUMN IF NOT EXISTS fee_cents bigint DEFAULT 0 CHECK (fee_cents >= 0),
ADD COLUMN IF NOT EXISTS net_amount_cents bigint CHECK (net_amount_cents <> 0),
ADD COLUMN IF NOT EXISTS processed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS failure_reason text;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference ON public.wallet_transactions(transaction_reference);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_external_reference ON public.wallet_transactions(external_reference_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_processed_at ON public.wallet_transactions(processed_at);

-- =============================================
-- UPDATE SUPPORT_TICKETS TABLE
-- =============================================

-- Add new columns to replace JSONB metadata
ALTER TABLE public.support_tickets 
ADD COLUMN IF NOT EXISTS ticket_reference text UNIQUE,
ADD COLUMN IF NOT EXISTS priority_score integer DEFAULT 0 CHECK (priority_score >= 0),
ADD COLUMN IF NOT EXISTS resolution_notes text,
ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS last_response_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS response_count integer DEFAULT 0 CHECK (response_count >= 0);

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_support_tickets_reference ON public.support_tickets(ticket_reference);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority_score ON public.support_tickets(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_closed_at ON public.support_tickets(closed_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_last_response_at ON public.support_tickets(last_response_at);

-- =============================================
-- UPDATE AUDIT_LOGS TABLE
-- =============================================

-- Add new columns to replace JSONB details
ALTER TABLE public.audit_logs 
ADD COLUMN IF NOT EXISTS old_values text, -- Store as JSON string instead of JSONB
ADD COLUMN IF NOT EXISTS new_values text, -- Store as JSON string instead of JSONB
ADD COLUMN IF NOT EXISTS user_agent text,
ADD COLUMN IF NOT EXISTS session_id text,
ADD COLUMN IF NOT EXISTS request_id text;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_agent ON public.audit_logs(user_agent);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON public.audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON public.audit_logs(request_id);

-- =============================================
-- UPDATE ROLES TABLE
-- =============================================

-- Add new columns to replace JSONB permissions
ALTER TABLE public.roles 
ADD COLUMN IF NOT EXISTS can_read boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS can_write boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS can_delete boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS can_manage_users boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS can_manage_trips boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS can_manage_vehicles boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS can_manage_payments boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS can_view_reports boolean DEFAULT false;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_roles_can_read ON public.roles(can_read);
CREATE INDEX IF NOT EXISTS idx_roles_can_write ON public.roles(can_write);
CREATE INDEX IF NOT EXISTS idx_roles_can_delete ON public.roles(can_delete);

-- =============================================
-- UPDATE COMMENTS
-- =============================================

-- Add comments for new columns
COMMENT ON COLUMN public.trips.trip_type IS 'Type of trip: standard, scheduled, or shared';
COMMENT ON COLUMN public.trips.passenger_count IS 'Number of passengers for this trip';
COMMENT ON COLUMN public.trips.special_instructions IS 'Special instructions for the driver';
COMMENT ON COLUMN public.trips.payment_method IS 'Payment method used for this trip';
COMMENT ON COLUMN public.trips.payment_status IS 'Current status of payment';
COMMENT ON COLUMN public.trips.driver_earnings_cents IS 'Amount driver earns from this trip in cents';
COMMENT ON COLUMN public.trips.commission_cents IS 'Platform commission from this trip in cents';

COMMENT ON COLUMN public.notifications.notification_type IS 'Type of notification for categorization';
COMMENT ON COLUMN public.notifications.reference_id IS 'ID of related entity (trip, payment, etc.)';
COMMENT ON COLUMN public.notifications.reference_type IS 'Type of related entity';
COMMENT ON COLUMN public.notifications.priority IS 'Notification priority level';
COMMENT ON COLUMN public.notifications.action_url IS 'URL for notification action';
COMMENT ON COLUMN public.notifications.expires_at IS 'When notification expires';

COMMENT ON COLUMN public.vehicle_types.type IS 'Vehicle type identifier (matches passenger backend)';
COMMENT ON COLUMN public.vehicle_types.display_name IS 'Human-readable vehicle type name';
COMMENT ON COLUMN public.vehicle_types.capacity IS 'Maximum passenger capacity';
COMMENT ON COLUMN public.vehicle_types.features IS 'Array of vehicle features';
COMMENT ON COLUMN public.vehicle_types.estimated_wait_time_minutes IS 'Estimated wait time for this vehicle type';

COMMENT ON COLUMN public.rides.driver_details IS 'Driver information stored as JSON string';
COMMENT ON COLUMN public.rides.trip_details IS 'Trip details stored as JSON string';
COMMENT ON COLUMN public.rides.selected_car IS 'Selected car details stored as JSON string';

COMMENT ON COLUMN public.wallet_transactions.transaction_reference IS 'Internal transaction reference';
COMMENT ON COLUMN public.wallet_transactions.external_reference_id IS 'External system reference ID';
COMMENT ON COLUMN public.wallet_transactions.fee_cents IS 'Transaction fee in cents';
COMMENT ON COLUMN public.wallet_transactions.net_amount_cents IS 'Net amount after fees in cents';
COMMENT ON COLUMN public.wallet_transactions.processed_at IS 'When transaction was processed';
COMMENT ON COLUMN public.wallet_transactions.failure_reason IS 'Reason for transaction failure';

COMMENT ON COLUMN public.support_tickets.ticket_reference IS 'Unique ticket reference number';
COMMENT ON COLUMN public.support_tickets.priority_score IS 'Calculated priority score';
COMMENT ON COLUMN public.support_tickets.resolution_notes IS 'Notes about ticket resolution';
COMMENT ON COLUMN public.support_tickets.closed_at IS 'When ticket was closed';
COMMENT ON COLUMN public.support_tickets.last_response_at IS 'Last response timestamp';
COMMENT ON COLUMN public.support_tickets.response_count IS 'Number of responses in this ticket';

COMMENT ON COLUMN public.audit_logs.old_values IS 'Previous values stored as JSON string';
COMMENT ON COLUMN public.audit_logs.new_values IS 'New values stored as JSON string';
COMMENT ON COLUMN public.audit_logs.user_agent IS 'User agent string from request';
COMMENT ON COLUMN public.audit_logs.session_id IS 'Session identifier';
COMMENT ON COLUMN public.audit_logs.request_id IS 'Request identifier for tracing';

-- =============================================
-- MIGRATE EXISTING DATA (if any)
-- =============================================

-- Update vehicle_types to set display_name
UPDATE public.vehicle_types 
SET display_name = CASE 
    WHEN type = 'standard' THEN 'Standard'
    WHEN type = 'premium' THEN 'Premium'
    WHEN type = 'luxury' THEN 'Luxury'
    WHEN type = 'suv' THEN 'SUV'
    WHEN type = 'motorcycle' THEN 'Motorcycle'
    ELSE type
END
WHERE display_name IS NULL;

-- =============================================
-- ADD AUDIT LOGGING
-- =============================================

-- Log the schema changes
INSERT INTO public.audit_logs (action, entity, details, created_at) VALUES
('schema_update', 'database', '{"changes": ["normalized JSONB fields to relational columns", "added rides table for passenger backend compatibility", "updated vehicle_types structure", "added proper indexes for new columns"]}', now());
