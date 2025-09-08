-- Migration: 001_initial_schema.sql
-- Description: Create initial database schema for Arada Transport Driver App
-- Created: 2025-01-27

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE IF NOT EXISTS public.users (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    phone_e164 text UNIQUE,
    email text UNIQUE,
    display_name text,
    avatar_url text,
    is_phone_verified boolean NOT NULL DEFAULT false,
    is_email_verified boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'pending_verification'::text CHECK (status = ANY (ARRAY['pending_verification'::text, 'verified'::text, 'suspended'::text, 'deleted'::text])),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    last_login_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT users_pkey PRIMARY KEY (id)
);

-- Create driver_profiles table
CREATE TABLE IF NOT EXISTS public.driver_profiles (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL UNIQUE,
    full_name text,
    first_name text,
    last_name text,
    date_of_birth date,
    gender text CHECK (gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text, 'Male'::text, 'Female'::text, 'Other'::text])),
    phone_number text,
    city text,
    emergency_contact_name text,
    emergency_contact_phone text,
    verification_status text NOT NULL DEFAULT 'unverified'::text CHECK (verification_status = ANY (ARRAY['unverified'::text, 'pending_review'::text, 'verified'::text, 'rejected'::text])),
    driver_license_number text,
    driver_license_expiry date,
    years_of_experience integer DEFAULT 0 CHECK (years_of_experience >= 0),
    rating_avg numeric DEFAULT 0.00 CHECK (rating_avg >= 0.00 AND rating_avg <= 5.00),
    rating_count integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
    total_trips integer NOT NULL DEFAULT 0 CHECK (total_trips >= 0),
    total_earnings_cents bigint NOT NULL DEFAULT 0 CHECK (total_earnings_cents >= 0),
    is_available boolean NOT NULL DEFAULT false,
    is_online boolean NOT NULL DEFAULT false,
    active_vehicle_id uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    last_known_location point,
    last_location_update timestamp with time zone,
    current_trip_id uuid,
    socket_id text,
    CONSTRAINT driver_profiles_pkey PRIMARY KEY (id),
    CONSTRAINT fk_driver_profiles_user FOREIGN KEY (user_id) REFERENCES public.users(id)
);

-- Create vehicle_classes table
CREATE TABLE IF NOT EXISTS public.vehicle_classes (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name text NOT NULL UNIQUE,
    description text,
    base_fare_cents bigint NOT NULL DEFAULT 0 CHECK (base_fare_cents >= 0),
    per_km_cents bigint NOT NULL DEFAULT 0 CHECK (per_km_cents >= 0),
    per_minute_cents bigint NOT NULL DEFAULT 0 CHECK (per_minute_cents >= 0),
    seats smallint NOT NULL DEFAULT 4 CHECK (seats >= 1 AND seats <= 20),
    category text NOT NULL DEFAULT 'standard'::text CHECK (category = ANY (ARRAY['standard'::text, 'premium'::text, 'luxury'::text, 'suv'::text, 'motorcycle'::text])),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT vehicle_classes_pkey PRIMARY KEY (id)
);

-- Create vehicles table
CREATE TABLE IF NOT EXISTS public.vehicles (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    driver_id uuid NOT NULL,
    class_id uuid NOT NULL,
    name text,
    make text NOT NULL,
    model text NOT NULL,
    year smallint CHECK (year >= 1970 AND year::numeric <= (EXTRACT(year FROM now()) + 1::numeric)),
    plate_number text NOT NULL UNIQUE,
    color text,
    is_active boolean NOT NULL DEFAULT true,
    verification_status text NOT NULL DEFAULT 'pending_review'::text CHECK (verification_status = ANY (ARRAY['pending_review'::text, 'verified'::text, 'rejected'::text])),
    transmission text CHECK (transmission = ANY (ARRAY['manual'::text, 'automatic'::text])),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT vehicles_pkey PRIMARY KEY (id),
    CONSTRAINT fk_vehicles_driver FOREIGN KEY (driver_id) REFERENCES public.driver_profiles(id),
    CONSTRAINT fk_vehicles_class FOREIGN KEY (class_id) REFERENCES public.vehicle_classes(id)
);

-- Create documents table
CREATE TABLE IF NOT EXISTS public.documents (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL,
    doc_type text NOT NULL CHECK (doc_type = ANY (ARRAY['driver_license'::text, 'vehicle_registration'::text, 'insurance'::text, 'profile_picture'::text, 'vehicle_photo'::text, 'other'::text])),
    file_path text NOT NULL,
    file_name text NOT NULL,
    file_size_bytes bigint CHECK (file_size_bytes > 0),
    mime_type text,
    public_url text,
    verification_status text NOT NULL DEFAULT 'pending_review'::text CHECK (verification_status = ANY (ARRAY['pending_review'::text, 'verified'::text, 'rejected'::text])),
    notes text,
    reviewed_at timestamp with time zone,
    reviewer_user_id uuid,
    uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT documents_pkey PRIMARY KEY (id),
    CONSTRAINT fk_documents_user FOREIGN KEY (user_id) REFERENCES public.users(id),
    CONSTRAINT fk_documents_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES public.users(id)
);

-- Create otp_codes table
CREATE TABLE IF NOT EXISTS public.otp_codes (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    phone_e164 text NOT NULL,
    code_hash text NOT NULL,
    purpose text NOT NULL DEFAULT 'registration'::text CHECK (purpose = ANY (ARRAY['registration'::text, 'login'::text, 'password_reset'::text, 'phone_change'::text, 'phone_verification'::text])),
    expires_at timestamp with time zone NOT NULL,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    is_used boolean NOT NULL DEFAULT false,
    used_at timestamp with time zone,
    device_id text,
    ip_address inet,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT otp_codes_pkey PRIMARY KEY (id)
);

-- Create trips table
CREATE TABLE IF NOT EXISTS public.trips (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    driver_id uuid,
    rider_id uuid,
    vehicle_id uuid,
    pickup_address text,
    pickup_point point,
    dropoff_address text,
    dropoff_point point,
    status text NOT NULL CHECK (status = ANY (ARRAY['requested'::text, 'accepted'::text, 'in_progress'::text, 'completed'::text, 'canceled'::text, 'no_show'::text])),
    estimated_fare_cents bigint CHECK (estimated_fare_cents >= 0),
    final_fare_cents bigint CHECK (final_fare_cents >= 0),
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    rider_rating smallint CHECK (rider_rating >= 1 AND rider_rating <= 5),
    driver_rating smallint CHECK (driver_rating >= 1 AND driver_rating <= 5),
    CONSTRAINT trips_pkey PRIMARY KEY (id),
    CONSTRAINT fk_trips_driver FOREIGN KEY (driver_id) REFERENCES public.driver_profiles(id),
    CONSTRAINT fk_trips_vehicle FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id)
);

-- Create wallet_accounts table
CREATE TABLE IF NOT EXISTS public.wallet_accounts (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    driver_id uuid NOT NULL UNIQUE,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT wallet_accounts_pkey PRIMARY KEY (id),
    CONSTRAINT fk_wallet_driver FOREIGN KEY (driver_id) REFERENCES public.driver_profiles(id)
);

-- Create wallet_transactions table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    wallet_id uuid NOT NULL,
    type text NOT NULL CHECK (type = ANY (ARRAY['deposit'::text, 'withdrawal'::text, 'trip_payout'::text, 'adjustment'::text])),
    amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
    reference_id uuid,
    note text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id),
    CONSTRAINT fk_tx_wallet FOREIGN KEY (wallet_id) REFERENCES public.wallet_accounts(id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_phone_e164 ON public.users(phone_e164);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_user_id ON public.driver_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_verification_status ON public.driver_profiles(verification_status);
CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id ON public.vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate_number ON public.vehicles(plate_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_verification_status ON public.vehicles(verification_status);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON public.documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_verification_status ON public.documents(verification_status);
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_e164 ON public.otp_codes(phone_e164);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON public.otp_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_codes_is_used ON public.otp_codes(is_used);
CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON public.trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON public.trips(status);
CREATE INDEX IF NOT EXISTS idx_wallet_accounts_driver_id ON public.wallet_accounts(driver_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON public.wallet_transactions(wallet_id);

-- Insert default vehicle classes
INSERT INTO public.vehicle_classes (name, description, base_fare_cents, per_km_cents, per_minute_cents, seats, category) VALUES
('Standard', 'Standard vehicle for regular trips', 5000, 150, 50, 4, 'standard'),
('Premium', 'Premium vehicle with better comfort', 7500, 200, 75, 4, 'premium'),
('Luxury', 'Luxury vehicle for special occasions', 10000, 300, 100, 4, 'luxury'),
('SUV', 'Large vehicle for groups or luggage', 8000, 250, 80, 7, 'suv'),
('Motorcycle', 'Motorcycle for quick city trips', 3000, 100, 30, 2, 'motorcycle')
ON CONFLICT (name) DO NOTHING;

-- Create a function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_driver_profiles_updated_at BEFORE UPDATE ON public.driver_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_trips_updated_at BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wallet_accounts_updated_at BEFORE UPDATE ON public.wallet_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO db_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO db_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO db_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO db_admin;
