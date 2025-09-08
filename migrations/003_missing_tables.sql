-- Migration: 003_missing_tables.sql
-- Description: Add missing tables from original schema
-- Created: 2025-01-27

-- =============================================
-- AUDIT & LOGGING
-- =============================================

-- Audit logs for tracking all user actions
CREATE TABLE public.audit_logs (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    actor_user_id uuid,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id uuid,
    details jsonb DEFAULT '{}'::jsonb,
    ip_address inet,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL
);

-- =============================================
-- ROLE-BASED ACCESS CONTROL
-- =============================================

-- Roles for different user types and permissions
CREATE TABLE public.roles (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name text NOT NULL UNIQUE,
    description text,
    permissions jsonb DEFAULT '[]'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT roles_pkey PRIMARY KEY (id)
);

-- Many-to-many relationship between users and roles
CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    assigned_by_user_id uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    expires_at timestamp with time zone,
    CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_roles_assigned_by FOREIGN KEY (assigned_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL
);

-- =============================================
-- PASSENGER PROFILES
-- =============================================

-- Rider profiles for passengers (separate from users for additional passenger-specific data)
CREATE TABLE public.rider_profiles (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL UNIQUE,
    full_name text,
    phone_number text,
    avatar_url text,
    rating_avg numeric DEFAULT 0.00 CHECK (rating_avg >= 0.00 AND rating_avg <= 5.00),
    rating_count integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
    total_trips integer NOT NULL DEFAULT 0 CHECK (total_trips >= 0),
    preferred_payment_method text CHECK (preferred_payment_method IN ('wallet', 'cash', 'card')),
    emergency_contact_name text,
    emergency_contact_phone text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT rider_profiles_pkey PRIMARY KEY (id),
    CONSTRAINT fk_rider_profiles_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- =============================================
-- DRIVER PICKUP REQUESTS
-- =============================================

-- Driver-specific pickup requests (different from regular trips)
CREATE TABLE public.driver_pickups (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    driver_id uuid NOT NULL,
    phone_number text,
    pickup_address text,
    pickup_latitude double precision,
    pickup_longitude double precision,
    pickup_point point,
    dropoff_address text,
    dropoff_latitude double precision,
    dropoff_longitude double precision,
    dropoff_point point,
    estimated_fare_cents bigint CHECK (estimated_fare_cents >= 0),
    final_fare_cents bigint CHECK (final_fare_cents >= 0),
    status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'accepted', 'completed', 'canceled')),
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    completed_at timestamp with time zone,
    CONSTRAINT driver_pickups_pkey PRIMARY KEY (id),
    CONSTRAINT fk_pickups_driver FOREIGN KEY (driver_id) REFERENCES public.driver_profiles(id) ON DELETE CASCADE
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Audit logs indexes
CREATE INDEX idx_audit_logs_actor_user_id ON public.audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity);
CREATE INDEX idx_audit_logs_entity_id ON public.audit_logs(entity_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);

-- Roles indexes
CREATE INDEX idx_roles_name ON public.roles(name);
CREATE INDEX idx_roles_is_active ON public.roles(is_active);

-- User roles indexes
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON public.user_roles(role_id);
CREATE INDEX idx_user_roles_expires_at ON public.user_roles(expires_at);

-- Rider profiles indexes
CREATE INDEX idx_rider_profiles_user_id ON public.rider_profiles(user_id);
CREATE INDEX idx_rider_profiles_rating_avg ON public.rider_profiles(rating_avg);
CREATE INDEX idx_rider_profiles_total_trips ON public.rider_profiles(total_trips);

-- Driver pickups indexes
CREATE INDEX idx_driver_pickups_driver_id ON public.driver_pickups(driver_id);
CREATE INDEX idx_driver_pickups_status ON public.driver_pickups(status);
CREATE INDEX idx_driver_pickups_created_at ON public.driver_pickups(created_at);
CREATE INDEX idx_driver_pickups_pickup_point ON public.driver_pickups USING GIST(pickup_point);
CREATE INDEX idx_driver_pickups_dropoff_point ON public.driver_pickups USING GIST(dropoff_point);

-- =============================================
-- TRIGGERS FOR DATA CONSISTENCY
-- =============================================

-- Update triggers for timestamp management
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to new tables
CREATE TRIGGER update_roles_updated_at
    BEFORE UPDATE ON public.roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rider_profiles_updated_at
    BEFORE UPDATE ON public.rider_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- INSERT DEFAULT ROLES
-- =============================================

-- Insert default roles for the system
INSERT INTO public.roles (id, name, description, permissions, is_active) VALUES
    (uuid_generate_v4(), 'admin', 'System Administrator', '["*"]', true),
    (uuid_generate_v4(), 'driver', 'Driver User', '["trip:read", "trip:update", "vehicle:read", "vehicle:update", "profile:read", "profile:update"]', true),
    (uuid_generate_v4(), 'passenger', 'Passenger User', '["trip:create", "trip:read", "profile:read", "profile:update"]', true),
    (uuid_generate_v4(), 'support', 'Customer Support', '["ticket:read", "ticket:update", "user:read"]', true),
    (uuid_generate_v4(), 'moderator', 'Content Moderator', '["document:read", "document:update", "user:read"]', true);

-- =============================================
-- UPDATE EXISTING TRIPS TABLE
-- =============================================

-- Add rider_id column to trips table to reference rider_profiles
ALTER TABLE public.trips 
ADD COLUMN IF NOT EXISTS rider_id uuid;

-- Add foreign key constraint only if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_trips_rider' 
        AND table_name = 'trips'
    ) THEN
        ALTER TABLE public.trips 
        ADD CONSTRAINT fk_trips_rider FOREIGN KEY (rider_id) REFERENCES public.rider_profiles(id);
    END IF;
END $$;

-- Create index for the new foreign key
CREATE INDEX IF NOT EXISTS idx_trips_rider_id ON public.trips(rider_id);

-- =============================================
-- UPDATE WALLET_ACCOUNTS TABLE
-- =============================================

-- Update wallet_accounts to reference users instead of driver_profiles
-- First, add the new column
ALTER TABLE public.wallet_accounts 
ADD COLUMN IF NOT EXISTS user_id uuid;

-- Add foreign key constraint only if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_wallet_user' 
        AND table_name = 'wallet_accounts'
    ) THEN
        ALTER TABLE public.wallet_accounts 
        ADD CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create index for the new foreign key
CREATE INDEX IF NOT EXISTS idx_wallet_accounts_user_id ON public.wallet_accounts(user_id);

-- =============================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================

-- Add table comments for better documentation
COMMENT ON TABLE public.audit_logs IS 'Audit trail for all user actions and system events';
COMMENT ON TABLE public.roles IS 'Role-based access control roles';
COMMENT ON TABLE public.user_roles IS 'Many-to-many relationship between users and roles';
COMMENT ON TABLE public.rider_profiles IS 'Passenger-specific profile information';
COMMENT ON TABLE public.driver_pickups IS 'Driver-specific pickup requests and management';

-- Add column comments
COMMENT ON COLUMN public.audit_logs.actor_user_id IS 'User who performed the action (NULL for system actions)';
COMMENT ON COLUMN public.audit_logs.action IS 'Action performed (e.g., create, update, delete, login)';
COMMENT ON COLUMN public.audit_logs.entity IS 'Entity type affected (e.g., user, trip, vehicle)';
COMMENT ON COLUMN public.audit_logs.entity_id IS 'ID of the affected entity';
COMMENT ON COLUMN public.audit_logs.details IS 'Additional details about the action in JSON format';

COMMENT ON COLUMN public.roles.permissions IS 'Array of permissions for this role in JSON format';
COMMENT ON COLUMN public.user_roles.expires_at IS 'When this role assignment expires (NULL for permanent)';

COMMENT ON COLUMN public.rider_profiles.preferred_payment_method IS 'Passenger preferred payment method';
COMMENT ON COLUMN public.rider_profiles.emergency_contact_name IS 'Emergency contact person name';
COMMENT ON COLUMN public.rider_profiles.emergency_contact_phone IS 'Emergency contact phone number';

COMMENT ON COLUMN public.driver_pickups.phone_number IS 'Contact phone number for pickup request';
COMMENT ON COLUMN public.driver_pickups.notes IS 'Additional notes for the pickup request';
