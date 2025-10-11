#!/bin/bash

# ============================================================================
# Arada Transport Database Migration Script
# ============================================================================
# This script migrates the complete database schema to the new PostgreSQL instance
# Database: arada_main_zvk2
# Host: dpg-d3l0bqpr0fns73euptg0-a.oregon-postgres.render.com
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Database credentials
DB_HOST="dpg-d3l0bqpr0fns73euptg0-a.oregon-postgres.render.com"
DB_USER="db_admin"
DB_NAME="arada_main_zvk2"
DB_PASSWORD="LQ6LCUW22LaJ2td8Dz6rvcqoYL50h8qn"

# Connection string
DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}/${DB_NAME}?sslmode=require"

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}  Arada Transport Database Migration${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""
echo -e "${YELLOW}Database:${NC} ${DB_NAME}"
echo -e "${YELLOW}Host:${NC} ${DB_HOST}"
echo -e "${YELLOW}User:${NC} ${DB_USER}"
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}Error: psql is not installed. Please install PostgreSQL client.${NC}"
    exit 1
fi

echo -e "${BLUE}Step 1: Testing database connection...${NC}"
if PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT version();" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Database connection successful${NC}"
else
    echo -e "${RED}✗ Failed to connect to database${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Step 2: Creating migration SQL file...${NC}"

# Create the migration SQL file
cat > /tmp/arada_migration.sql << 'EOF'
-- ============================================================================
-- Arada Transport Unified Database Schema Migration
-- Generated: $(date)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================================
-- Core User Management
-- ============================================================================

-- Users table
CREATE TABLE IF NOT EXISTS public.users (
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
    otp text,
    otp_expires_at timestamp with time zone,
    preferred_language text DEFAULT 'en',
    notification_preferences text DEFAULT 'all' CHECK (notification_preferences IN ('all', 'trips_only', 'none')),
    emergency_contact_name text,
    emergency_contact_phone text,
    date_of_birth date,
    gender text CHECK (gender IN ('male', 'female', 'other')),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    CONSTRAINT users_pkey PRIMARY KEY (id)
);

-- Driver profiles table
CREATE TABLE IF NOT EXISTS public.driver_profiles (
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
    years_of_experience integer DEFAULT 0,
    rating_avg numeric DEFAULT 0.00,
    rating_count integer NOT NULL DEFAULT 0,
    total_trips integer NOT NULL DEFAULT 0,
    total_earnings_cents bigint NOT NULL DEFAULT 0,
    is_available boolean NOT NULL DEFAULT false,
    is_online boolean NOT NULL DEFAULT false,
    verification_status text NOT NULL DEFAULT 'unverified',
    last_known_location point,
    last_location_update timestamp with time zone,
    current_trip_id uuid,
    socket_id text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT driver_profiles_pkey PRIMARY KEY (id),
    CONSTRAINT fk_driver_profiles_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Passenger profiles table
CREATE TABLE IF NOT EXISTS public.passenger_profiles (
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
    CONSTRAINT passenger_profiles_pkey PRIMARY KEY (id),
    CONSTRAINT fk_passenger_profiles_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- ============================================================================
-- Vehicle Management
-- ============================================================================

-- Vehicle types table
CREATE TABLE IF NOT EXISTS public.vehicle_types (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    type text NOT NULL UNIQUE,
    display_name text,
    description text,
    image_url text NOT NULL,
    base_fare_cents bigint NOT NULL DEFAULT 0 CHECK (base_fare_cents >= 0),
    price_per_km_cents bigint NOT NULL DEFAULT 0 CHECK (price_per_km_cents >= 0),
    price_per_minute_cents bigint NOT NULL DEFAULT 0 CHECK (price_per_minute_cents >= 0),
    seats smallint NOT NULL DEFAULT 4 CHECK (seats >= 1 AND seats <= 20),
    capacity smallint DEFAULT 4 CHECK (capacity >= 1 AND capacity <= 20),
    category text NOT NULL DEFAULT 'standard' CHECK (category IN ('standard', 'premium', 'luxury', 'suv', 'motorcycle')),
    features text[],
    estimated_wait_time_minutes integer DEFAULT 5 CHECK (estimated_wait_time_minutes >= 0),
    base_fare numeric,
    price_per_km numeric,
    wait_time_per_minute_cents bigint DEFAULT 0 CHECK (wait_time_per_minute_cents >= 0),
    minimum_fare_cents bigint DEFAULT 0 CHECK (minimum_fare_cents >= 0),
    maximum_fare_cents bigint CHECK (maximum_fare_cents >= 0),
    is_available boolean DEFAULT true,
    requires_license boolean DEFAULT true,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT vehicle_types_pkey PRIMARY KEY (id)
);

-- Vehicles table
CREATE TABLE IF NOT EXISTS public.vehicles (
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

-- ============================================================================
-- Trip Management
-- ============================================================================

-- Trips table
CREATE TABLE IF NOT EXISTS public.trips (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    passenger_id uuid NOT NULL,
    passenger_profile_id uuid,
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
    trip_type text DEFAULT 'standard' CHECK (trip_type IN ('standard', 'scheduled', 'shared')),
    passenger_count smallint DEFAULT 1 CHECK (passenger_count >= 1 AND passenger_count <= 8),
    special_instructions text,
    payment_method text DEFAULT 'cash' CHECK (payment_method IN ('cash', 'wallet', 'card')),
    payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
    driver_earnings_cents bigint CHECK (driver_earnings_cents >= 0),
    commission_cents bigint CHECK (commission_cents >= 0),
    canceled_by_user_id uuid,
    trip_reference text UNIQUE,
    driver_details text,
    selected_vehicle_details text,
    trip_notes text,
    special_requirements text,
    estimated_wait_time_minutes integer DEFAULT 5 CHECK (estimated_wait_time_minutes >= 0),
    actual_wait_time_minutes integer CHECK (actual_wait_time_minutes >= 0),
    surge_multiplier numeric DEFAULT 1.0 CHECK (surge_multiplier >= 1.0),
    discount_cents bigint DEFAULT 0 CHECK (discount_cents >= 0),
    tip_cents bigint DEFAULT 0 CHECK (tip_cents >= 0),
    platform_fee_cents bigint DEFAULT 0 CHECK (platform_fee_cents >= 0),
    cancellation_fee_cents bigint DEFAULT 0 CHECK (cancellation_fee_cents >= 0),
    request_timestamp timestamp with time zone,
    accepted_at timestamp with time zone,
    driver_assigned_at timestamp with time zone,
    driver_arrived_at timestamp with time zone,
    started_at timestamp with time zone,
    trip_started_at timestamp with time zone,
    completed_at timestamp with time zone,
    trip_completed_at timestamp with time zone,
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
    CONSTRAINT fk_trips_passenger_profile FOREIGN KEY (passenger_profile_id) REFERENCES public.passenger_profiles(id),
    CONSTRAINT fk_trips_driver FOREIGN KEY (driver_id) REFERENCES public.driver_profiles(id),
    CONSTRAINT fk_trips_vehicle FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id),
    CONSTRAINT fk_trips_vehicle_type FOREIGN KEY (vehicle_type_id) REFERENCES public.vehicle_types(id),
    CONSTRAINT fk_trips_canceled_by FOREIGN KEY (canceled_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL
);

-- Driver pickups table
CREATE TABLE IF NOT EXISTS public.driver_pickups (
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

-- ============================================================================
-- User Features
-- ============================================================================

-- Favorite places table
CREATE TABLE IF NOT EXISTS public.favorite_places (
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

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    type text NOT NULL DEFAULT 'general',
    notification_type text DEFAULT 'general' CHECK (notification_type IN ('general', 'trip_update', 'payment', 'promotion', 'system')),
    reference_id uuid,
    reference_type text CHECK (reference_type IN ('trip', 'payment', 'user', 'system')),
    priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    action_url text,
    expires_at timestamp with time zone,
    is_read boolean NOT NULL DEFAULT false,
    read_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- ============================================================================
-- Document Management
-- ============================================================================

-- Documents table
CREATE TABLE IF NOT EXISTS public.documents (
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

-- ============================================================================
-- Financial System
-- ============================================================================

-- Wallet accounts table
CREATE TABLE IF NOT EXISTS public.wallet_accounts (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL UNIQUE,
    balance_cents bigint NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'ETB',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT wallet_accounts_pkey PRIMARY KEY (id),
    CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Wallet transactions table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    wallet_id uuid NOT NULL,
    type text NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'trip_payment', 'trip_payout', 'refund', 'adjustment', 'bonus')),
    amount_cents bigint NOT NULL,
    balance_after_cents bigint NOT NULL,
    reference_id uuid,
    reference_type text,
    description text,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id),
    CONSTRAINT fk_tx_wallet FOREIGN KEY (wallet_id) REFERENCES public.wallet_accounts(id) ON DELETE CASCADE
);

-- ============================================================================
-- Authentication & Security
-- ============================================================================

-- OTP codes table
CREATE TABLE IF NOT EXISTS public.otp_codes (
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

-- ============================================================================
-- Role-Based Access Control
-- ============================================================================

-- Roles table
CREATE TABLE IF NOT EXISTS public.roles (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name text NOT NULL UNIQUE,
    description text,
    permissions jsonb DEFAULT '[]'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT roles_pkey PRIMARY KEY (id)
);

-- User roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
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

-- ============================================================================
-- Audit & Logging
-- ============================================================================

-- Audit logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
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

-- ============================================================================
-- Admin & Content Management
-- ============================================================================

-- Ads table
CREATE TABLE IF NOT EXISTS public.ads (
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

-- Support tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
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

-- ============================================================================
-- Create Indexes for Performance
-- ============================================================================

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_type ON public.users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_active ON public.users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_created ON public.users(created_at);

-- Driver profiles indexes
CREATE INDEX IF NOT EXISTS idx_driver_profiles_user ON public.driver_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_available ON public.driver_profiles(is_available);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_online ON public.driver_profiles(is_online);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_verification ON public.driver_profiles(verification_status);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_rating ON public.driver_profiles(rating_avg);

-- Passenger profiles indexes
CREATE INDEX IF NOT EXISTS idx_passenger_profiles_user ON public.passenger_profiles(user_id);

-- Vehicles indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_driver ON public.vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_type ON public.vehicles(vehicle_type_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON public.vehicles(plate_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_active ON public.vehicles(is_active);

-- Trips indexes
CREATE INDEX IF NOT EXISTS idx_trips_passenger ON public.trips(passenger_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver ON public.trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON public.trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_created ON public.trips(created_at);
CREATE INDEX IF NOT EXISTS idx_trips_reference ON public.trips(trip_reference);

-- Wallet indexes
CREATE INDEX IF NOT EXISTS idx_wallet_accounts_user ON public.wallet_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON public.wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON public.wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created ON public.wallet_transactions(created_at);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications(created_at);

-- Documents indexes
CREATE INDEX IF NOT EXISTS idx_documents_user ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON public.documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_verification ON public.documents(verification_status);

-- OTP codes indexes
CREATE INDEX IF NOT EXISTS idx_otp_phone ON public.otp_codes(phone_number);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON public.otp_codes(expires_at);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at);

-- ============================================================================
-- Create Update Timestamp Triggers
-- ============================================================================

-- Create trigger function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables with updated_at column
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_driver_profiles_updated_at BEFORE UPDATE ON public.driver_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_passenger_profiles_updated_at BEFORE UPDATE ON public.passenger_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.vehicles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trips_updated_at BEFORE UPDATE ON public.trips
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wallet_accounts_updated_at BEFORE UPDATE ON public.wallet_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON public.roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ads_updated_at BEFORE UPDATE ON public.ads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Migration Complete
-- ============================================================================
EOF

echo -e "${GREEN}✓ Migration SQL file created${NC}"

echo ""
echo -e "${BLUE}Step 3: Running database migration...${NC}"
echo -e "${YELLOW}This may take a few minutes...${NC}"
echo ""

# Run the migration
if PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -f /tmp/arada_migration.sql; then
    echo ""
    echo -e "${GREEN}============================================================================${NC}"
    echo -e "${GREEN}  ✓ Migration completed successfully!${NC}"
    echo -e "${GREEN}============================================================================${NC}"
    echo ""
    
    # Get table count
    TABLE_COUNT=$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")
    
    echo -e "${BLUE}Database Statistics:${NC}"
    echo -e "  • Total Tables: ${GREEN}${TABLE_COUNT}${NC}"
    echo ""
    
    # List all tables
    echo -e "${BLUE}Created Tables:${NC}"
    PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -c "
    SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
    FROM pg_tables 
    WHERE schemaname = 'public' 
    ORDER BY tablename;
    "
    
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo -e "  1. Update backend .env file with new DATABASE_URL"
    echo -e "  2. Restart backend server"
    echo -e "  3. Test API endpoints"
    echo -e "  4. Run data seeding if needed"
    echo ""
    
    # Clean up
    rm -f /tmp/arada_migration.sql
    
else
    echo ""
    echo -e "${RED}============================================================================${NC}"
    echo -e "${RED}  ✗ Migration failed${NC}"
    echo -e "${RED}============================================================================${NC}"
    echo ""
    echo -e "${YELLOW}Please check the error messages above for details.${NC}"
    echo ""
    
    # Keep the SQL file for debugging
    echo -e "${YELLOW}Migration SQL file saved at: /tmp/arada_migration.sql${NC}"
    echo ""
    
    exit 1
fi
