-- Migration: 020_driver_flagging_system.sql
-- Description: Add driver flagging, reporting, and deactivation system
-- Created: 2025-01-27

-- =============================================
-- DRIVER FLAGGING & REPORTING SYSTEM
-- =============================================

-- Driver flags/reports table
-- Stores reports from users about drivers
CREATE TABLE IF NOT EXISTS public.driver_flags (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    driver_id uuid NOT NULL,
    driver_user_id uuid NOT NULL,
    reported_by_user_id uuid NOT NULL,
    flag_reason text NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'resolved', 'dismissed')),
    assigned_to_admin_id uuid,
    trip_id uuid,
    priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    resolution_notes text,
    resolved_at timestamp with time zone,
    resolved_by_user_id uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT driver_flags_pkey PRIMARY KEY (id),
    CONSTRAINT fk_driver_flags_driver FOREIGN KEY (driver_id) REFERENCES public.driver_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_driver_flags_driver_user FOREIGN KEY (driver_user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_driver_flags_reported_by FOREIGN KEY (reported_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT fk_driver_flags_assigned_admin FOREIGN KEY (assigned_to_admin_id) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT fk_driver_flags_trip FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL,
    CONSTRAINT fk_driver_flags_resolved_by FOREIGN KEY (resolved_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL
);

-- Driver deactivations table
-- Stores deactivation records for drivers
CREATE TABLE IF NOT EXISTS public.driver_deactivations (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    driver_id uuid NOT NULL,
    driver_user_id uuid NOT NULL,
    deactivated_by_user_id uuid NOT NULL,
    deactivation_reason text NOT NULL,
    flag_id uuid,
    is_active boolean NOT NULL DEFAULT true,
    reactivated_by_user_id uuid,
    reactivated_at timestamp with time zone,
    reactivation_reason text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT driver_deactivations_pkey PRIMARY KEY (id),
    CONSTRAINT fk_driver_deactivations_driver FOREIGN KEY (driver_id) REFERENCES public.driver_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_driver_deactivations_driver_user FOREIGN KEY (driver_user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_driver_deactivations_deactivated_by FOREIGN KEY (deactivated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT fk_driver_deactivations_flag FOREIGN KEY (flag_id) REFERENCES public.driver_flags(id) ON DELETE SET NULL,
    CONSTRAINT fk_driver_deactivations_reactivated_by FOREIGN KEY (reactivated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL
);

-- Add deactivation status fields to users table if not exists
DO $$ 
BEGIN
    -- Add account_status column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'account_status'
    ) THEN
        ALTER TABLE public.users 
        ADD COLUMN account_status text DEFAULT 'active' 
        CHECK (account_status IN ('active', 'deactivated', 'suspended', 'pending_verification'));
    END IF;

    -- Add deactivation_reason column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'deactivation_reason'
    ) THEN
        ALTER TABLE public.users 
        ADD COLUMN deactivation_reason text;
    END IF;

    -- Add deactivated_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'deactivated_at'
    ) THEN
        ALTER TABLE public.users 
        ADD COLUMN deactivated_at timestamp with time zone;
    END IF;
END $$;

-- Add flag_count to driver_profiles for quick reference
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'driver_profiles' 
        AND column_name = 'flag_count'
    ) THEN
        ALTER TABLE public.driver_profiles 
        ADD COLUMN flag_count integer NOT NULL DEFAULT 0 CHECK (flag_count >= 0);
    END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_driver_flags_driver_id ON public.driver_flags(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_flags_driver_user_id ON public.driver_flags(driver_user_id);
CREATE INDEX IF NOT EXISTS idx_driver_flags_reported_by ON public.driver_flags(reported_by_user_id);
CREATE INDEX IF NOT EXISTS idx_driver_flags_status ON public.driver_flags(status);
CREATE INDEX IF NOT EXISTS idx_driver_flags_assigned_admin ON public.driver_flags(assigned_to_admin_id);
CREATE INDEX IF NOT EXISTS idx_driver_flags_created_at ON public.driver_flags(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_flags_trip_id ON public.driver_flags(trip_id);

CREATE INDEX IF NOT EXISTS idx_driver_deactivations_driver_id ON public.driver_deactivations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_deactivations_driver_user_id ON public.driver_deactivations(driver_user_id);
CREATE INDEX IF NOT EXISTS idx_driver_deactivations_is_active ON public.driver_deactivations(is_active);
CREATE INDEX IF NOT EXISTS idx_driver_deactivations_created_at ON public.driver_deactivations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_deactivations_flag_id ON public.driver_deactivations(flag_id);

CREATE INDEX IF NOT EXISTS idx_users_account_status ON public.users(account_status);
CREATE INDEX IF NOT EXISTS idx_users_deactivated_at ON public.users(deactivated_at);

-- Create function to update flag_count when flags are created/deleted
CREATE OR REPLACE FUNCTION update_driver_flag_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.driver_profiles
        SET flag_count = flag_count + 1
        WHERE id = NEW.driver_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.driver_profiles
        SET flag_count = GREATEST(0, flag_count - 1)
        WHERE id = OLD.driver_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for flag_count updates
DROP TRIGGER IF EXISTS trigger_update_driver_flag_count ON public.driver_flags;
CREATE TRIGGER trigger_update_driver_flag_count
    AFTER INSERT OR DELETE ON public.driver_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_driver_flag_count();

-- Add comments for documentation
COMMENT ON TABLE public.driver_flags IS 'Stores user reports/flags about drivers';
COMMENT ON TABLE public.driver_deactivations IS 'Stores driver deactivation records';
COMMENT ON COLUMN public.users.account_status IS 'Account status: active, deactivated, suspended, pending_verification';
COMMENT ON COLUMN public.driver_profiles.flag_count IS 'Total number of flags/reports for this driver';

