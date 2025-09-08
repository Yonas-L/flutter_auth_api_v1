-- Migration: 002_unified_schema.sql
-- Description: Unified database schema for both passenger and driver apps
-- Created: 2025-01-27

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- =============================================
-- CORE USER MANAGEMENT
-- =============================================

-- Users table (unified for both passengers and drivers)
CREATE TABLE public.users (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    phone_number text NOT NULL UNIQUE,
    email text UNIQUE,
    full_name text,
    avatar_url text,
    user_type text NOT NULL DEFAULT 'passenger' CHECK (user_type IN ('passenger', 'driver', 'admin')),
    is_phone_verified boolean NOT NULL DEFAULT false,
    is_email_verified boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    CONSTRAINT users_pkey PRIMARY KEY (id)
);

-- Driver profiles (only for drivers)
CREATE TABLE public.driver_profiles (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL UNIQUE,
    first_name text,
    last_name text,
    date_of_birth date,
    gender text CHECK (gender IN ('male', 'female', 'other')),
    city text,
    emergency_contact_name text,
    emergency_contact_phone text,
    driver_license_number text UNIQUE,
    driver_license_expiry date,
    years_of_experience integer DEFAULT 0 CHECK (years_of_experience >= 0),
    rating_avg numeric DEFAULT 0.00 CHECK (rating_avg >= 0.00 AND rating_avg <= 5.00),
    rating_count integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
    total_trips integer NOT NULL DEFAULT 0 CHECK (total_trips >= 0),
    total_earnings_cents bigint NOT NULL DEFAULT 0 CHECK (total_earnings_cents >= 0),
    is_available boolean NOT NULL DEFAULT false,
    is_online boolean NOT NULL DEFAULT false,
    verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'pending_review', 'verified', 'rejected')),
    last_known_location point,
    last_location_update timestamp with time zone,
    current_trip_id uuid,
    socket_id text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT driver_profiles_pkey PRIMARY KEY (id),
    CONSTRAINT fk_driver_profiles_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- =============================================
-- VEHICLE MANAGEMENT
-- =============================================

-- Vehicle types/classes (unified)
CREATE TABLE public.vehicle_types (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    name text NOT NULL UNIQUE,
    description text,
    image_url text NOT NULL,
    base_fare_cents bigint NOT NULL DEFAULT 0 CHECK (base_fare_cents >= 0),
    price_per_km_cents bigint NOT NULL DEFAULT 0 CHECK (price_per_km_cents >= 0),
    price_per_minute_cents bigint NOT NULL DEFAULT 0 CHECK (price_per_minute_cents >= 0),
    seats smallint NOT NULL DEFAULT 4 CHECK (seats >= 1 AND seats <= 20),
    category text NOT NULL DEFAULT 'standard' CHECK (category IN ('standard', 'premium', 'luxury', 'suv', 'motorcycle')),
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT vehicle_types_pkey PRIMARY KEY (id)
);

-- Vehicles (only for drivers)
CREATE TABLE public.vehicles (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    driver_id uuid NOT NULL,
    vehicle_type_id bigint NOT NULL,
    name text,
    make text NOT NULL,
    model text NOT NULL,
    year smallint CHECK (year >= 1970 AND year <= EXTRACT(year FROM now()) + 1),
    plate_number text NOT NULL UNIQUE,
    color text,
    transmission text CHECK (transmission IN ('manual', 'automatic')),
    is_active boolean NOT NULL DEFAULT true,
    verification_status text NOT NULL DEFAULT 'pending_review' CHECK (verification_status IN ('pending_review', 'verified', 'rejected')),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT vehicles_pkey PRIMARY KEY (id),
    CONSTRAINT fk_vehicles_driver FOREIGN KEY (driver_id) REFERENCES public.driver_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_vehicles_type FOREIGN KEY (vehicle_type_id) REFERENCES public.vehicle_types(id)
);

-- =============================================
-- TRIP MANAGEMENT
-- =============================================

-- Trips (unified for both passengers and drivers)
CREATE TABLE public.trips (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    passenger_id uuid NOT NULL,
    driver_id uuid,
    vehicle_id uuid,
    vehicle_type_id bigint,
    status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'accepted', 'in_progress', 'completed', 'canceled', 'no_show')),
    pickup_address text,
    pickup_latitude double precision,
    pickup_longitude double precision,
    pickup_point point,
    dropoff_address text,
    dropoff_latitude double precision,
    dropoff_longitude double precision,
    dropoff_point point,
    estimated_distance_km numeric,
    estimated_duration_minutes integer,
    estimated_fare_cents bigint CHECK (estimated_fare_cents >= 0),
    final_fare_cents bigint CHECK (final_fare_cents >= 0),
    actual_distance_km numeric,
    actual_duration_minutes integer,
    trip_details jsonb, -- Store additional trip information
    selected_vehicle_details jsonb, -- Store selected vehicle information
    request_timestamp timestamp with time zone,
    accepted_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    canceled_at timestamp with time zone,
    cancel_reason text,
    passenger_rating smallint CHECK (passenger_rating >= 1 AND passenger_rating <= 5),
    driver_rating smallint CHECK (driver_rating >= 1 AND driver_rating <= 5),
    passenger_comment text,
    driver_comment text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT trips_pkey PRIMARY KEY (id),
    CONSTRAINT fk_trips_passenger FOREIGN KEY (passenger_id) REFERENCES public.users(id),
    CONSTRAINT fk_trips_driver FOREIGN KEY (driver_id) REFERENCES public.driver_profiles(id),
    CONSTRAINT fk_trips_vehicle FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id),
    CONSTRAINT fk_trips_vehicle_type FOREIGN KEY (vehicle_type_id) REFERENCES public.vehicle_types(id)
);

-- =============================================
-- USER PREFERENCES & FEATURES
-- =============================================

-- Favorite places (for passengers)
CREATE TABLE public.favorite_places (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL,
    label text NOT NULL,
    address text NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    location_point point,
    icon text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT favorite_places_pkey PRIMARY KEY (id),
    CONSTRAINT fk_favorite_places_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Notifications (for all users)
CREATE TABLE public.notifications (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    type text NOT NULL DEFAULT 'general' CHECK (type IN ('general', 'trip', 'payment', 'promotion', 'system')),
    metadata jsonb,
    is_read boolean NOT NULL DEFAULT false,
    read_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- =============================================
-- DOCUMENT MANAGEMENT
-- =============================================

-- Documents (for drivers and passengers)
CREATE TABLE public.documents (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL,
    doc_type text NOT NULL CHECK (doc_type IN ('driver_license', 'vehicle_registration', 'insurance', 'profile_picture', 'vehicle_photo', 'id_card', 'other')),
    file_path text NOT NULL,
    file_name text NOT NULL,
    file_size_bytes bigint CHECK (file_size_bytes > 0),
    mime_type text,
    public_url text,
    verification_status text NOT NULL DEFAULT 'pending_review' CHECK (verification_status IN ('pending_review', 'verified', 'rejected')),
    notes text,
    reviewed_at timestamp with time zone,
    reviewer_user_id uuid,
    uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT documents_pkey PRIMARY KEY (id),
    CONSTRAINT fk_documents_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_documents_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES public.users(id)
);

-- =============================================
-- AUTHENTICATION & SECURITY
-- =============================================

-- OTP codes (for all users)
CREATE TABLE public.otp_codes (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    phone_number text NOT NULL,
    code_hash text NOT NULL,
    purpose text NOT NULL DEFAULT 'registration' CHECK (purpose IN ('registration', 'login', 'password_reset', 'phone_change', 'phone_verification')),
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

-- =============================================
-- FINANCIAL MANAGEMENT
-- =============================================

-- Wallet accounts (for drivers and passengers)
CREATE TABLE public.wallet_accounts (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL UNIQUE,
    balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
    currency text NOT NULL DEFAULT 'ETB',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT wallet_accounts_pkey PRIMARY KEY (id),
    CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Wallet transactions (for all users)
CREATE TABLE public.wallet_transactions (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    wallet_id uuid NOT NULL,
    type text NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'trip_payment', 'trip_payout', 'refund', 'adjustment', 'bonus')),
    amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
    balance_after_cents bigint NOT NULL,
    reference_id uuid, -- Reference to trip, payment, etc.
    reference_type text, -- 'trip', 'payment', 'refund', etc.
    description text,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id),
    CONSTRAINT fk_tx_wallet FOREIGN KEY (wallet_id) REFERENCES public.wallet_accounts(id) ON DELETE CASCADE
);

-- =============================================
-- ADMIN & CONTENT MANAGEMENT
-- =============================================

-- Ads (for admin management)
CREATE TABLE public.ads (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    title text NOT NULL,
    description text,
    image_url text NOT NULL,
    target_url text,
    target_user_type text CHECK (target_user_type IN ('passenger', 'driver', 'all')),
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    click_count bigint NOT NULL DEFAULT 0,
    impression_count bigint NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT ads_pkey PRIMARY KEY (id)
);

-- Support tickets (for all users)
CREATE TABLE public.support_tickets (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL,
    assigned_to_user_id uuid,
    subject text NOT NULL,
    message text NOT NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    category text NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'trip', 'payment', 'technical', 'account')),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT support_tickets_pkey PRIMARY KEY (id),
    CONSTRAINT fk_support_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_support_assigned FOREIGN KEY (assigned_to_user_id) REFERENCES public.users(id)
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Users indexes
CREATE INDEX idx_users_phone_number ON public.users(phone_number);
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_user_type ON public.users(user_type);
CREATE INDEX idx_users_is_active ON public.users(is_active);

-- Driver profiles indexes
CREATE INDEX idx_driver_profiles_user_id ON public.driver_profiles(user_id);
CREATE INDEX idx_driver_profiles_verification_status ON public.driver_profiles(verification_status);
CREATE INDEX idx_driver_profiles_is_available ON public.driver_profiles(is_available);
CREATE INDEX idx_driver_profiles_is_online ON public.driver_profiles(is_online);
CREATE INDEX idx_driver_profiles_license ON public.driver_profiles(driver_license_number);

-- Vehicle types indexes
CREATE INDEX idx_vehicle_types_category ON public.vehicle_types(category);
CREATE INDEX idx_vehicle_types_is_active ON public.vehicle_types(is_active);
CREATE INDEX idx_vehicle_types_sort_order ON public.vehicle_types(sort_order);

-- Vehicles indexes
CREATE INDEX idx_vehicles_driver_id ON public.vehicles(driver_id);
CREATE INDEX idx_vehicles_vehicle_type_id ON public.vehicles(vehicle_type_id);
CREATE INDEX idx_vehicles_plate_number ON public.vehicles(plate_number);
CREATE INDEX idx_vehicles_verification_status ON public.vehicles(verification_status);
CREATE INDEX idx_vehicles_is_active ON public.vehicles(is_active);

-- Trips indexes
CREATE INDEX idx_trips_passenger_id ON public.trips(passenger_id);
CREATE INDEX idx_trips_driver_id ON public.trips(driver_id);
CREATE INDEX idx_trips_vehicle_id ON public.trips(vehicle_id);
CREATE INDEX idx_trips_status ON public.trips(status);
CREATE INDEX idx_trips_created_at ON public.trips(created_at);
CREATE INDEX idx_trips_pickup_point ON public.trips USING GIST (pickup_point);
CREATE INDEX idx_trips_dropoff_point ON public.trips USING GIST (dropoff_point);

-- Favorite places indexes
CREATE INDEX idx_favorite_places_user_id ON public.favorite_places(user_id);
CREATE INDEX idx_favorite_places_location ON public.favorite_places USING GIST (location_point);

-- Notifications indexes
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at);
CREATE INDEX idx_notifications_type ON public.notifications(type);

-- Documents indexes
CREATE INDEX idx_documents_user_id ON public.documents(user_id);
CREATE INDEX idx_documents_doc_type ON public.documents(doc_type);
CREATE INDEX idx_documents_verification_status ON public.documents(verification_status);

-- OTP codes indexes
CREATE INDEX idx_otp_codes_phone_number ON public.otp_codes(phone_number);
CREATE INDEX idx_otp_codes_expires_at ON public.otp_codes(expires_at);
CREATE INDEX idx_otp_codes_is_used ON public.otp_codes(is_used);

-- Wallet indexes
CREATE INDEX idx_wallet_accounts_user_id ON public.wallet_accounts(user_id);
CREATE INDEX idx_wallet_transactions_wallet_id ON public.wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_transactions_type ON public.wallet_transactions(type);
CREATE INDEX idx_wallet_transactions_created_at ON public.wallet_transactions(created_at);

-- Ads indexes
CREATE INDEX idx_ads_is_active ON public.ads(is_active);
CREATE INDEX idx_ads_sort_order ON public.ads(sort_order);
CREATE INDEX idx_ads_target_user_type ON public.ads(target_user_type);

-- Support tickets indexes
CREATE INDEX idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX idx_support_tickets_priority ON public.support_tickets(priority);

-- =============================================
-- TRIGGERS FOR AUTO-UPDATE TIMESTAMPS
-- =============================================

-- Create function for updating timestamps
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
CREATE TRIGGER update_trips_updated_at BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wallet_accounts_updated_at BEFORE UPDATE ON public.wallet_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ads_updated_at BEFORE UPDATE ON public.ads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- SAMPLE DATA
-- =============================================

-- Insert default vehicle types
INSERT INTO public.vehicle_types (name, description, image_url, base_fare_cents, price_per_km_cents, price_per_minute_cents, seats, category, sort_order) VALUES
('Standard', 'Standard vehicle for regular trips', 'https://example.com/standard.png', 5000, 150, 50, 4, 'standard', 1),
('Premium', 'Premium vehicle with better comfort', 'https://example.com/premium.png', 7500, 200, 75, 4, 'premium', 2),
('Luxury', 'Luxury vehicle for special occasions', 'https://example.com/luxury.png', 10000, 300, 100, 4, 'luxury', 3),
('SUV', 'Large vehicle for groups or luggage', 'https://example.com/suv.png', 8000, 250, 80, 7, 'suv', 4),
('Motorcycle', 'Motorcycle for quick city trips', 'https://example.com/motorcycle.png', 3000, 100, 30, 2, 'motorcycle', 5)
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- PERMISSIONS
-- =============================================

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO db_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO db_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO db_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO db_admin;
