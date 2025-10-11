-- ============================================================================
-- Migration 009: Fix Database Schema Alignment
-- Aligns database with website, backend, and Flutter app requirements
-- ============================================================================

-- 1. Add Chapa payment integration fields to wallet_transactions
-- ============================================================================
DO $$ 
BEGIN
    -- Add chapa_tx_ref column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wallet_transactions' AND column_name = 'chapa_tx_ref'
    ) THEN
        ALTER TABLE wallet_transactions 
        ADD COLUMN chapa_tx_ref TEXT;
        
        CREATE INDEX IF NOT EXISTS idx_wallet_transactions_chapa_tx_ref 
        ON wallet_transactions(chapa_tx_ref);
    END IF;

    -- Add chapa_checkout_url column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wallet_transactions' AND column_name = 'chapa_checkout_url'
    ) THEN
        ALTER TABLE wallet_transactions 
        ADD COLUMN chapa_checkout_url TEXT;
    END IF;

    -- Add chapa_status column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wallet_transactions' AND column_name = 'chapa_status'
    ) THEN
        ALTER TABLE wallet_transactions 
        ADD COLUMN chapa_status TEXT;
    END IF;

    -- Add payment_method column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wallet_transactions' AND column_name = 'payment_method'
    ) THEN
        ALTER TABLE wallet_transactions 
        ADD COLUMN payment_method TEXT 
        CHECK (payment_method IN ('telebirr', 'cbebirr', 'mpesa', 'ebirr', 'cash', 'bank_transfer'));
    END IF;
END $$;

-- 2. Add wallet_id column to withdrawal_requests
-- ============================================================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'withdrawal_requests' AND column_name = 'wallet_id'
    ) THEN
        -- Add wallet_id column
        ALTER TABLE withdrawal_requests 
        ADD COLUMN wallet_id UUID;

        -- Update existing records to populate wallet_id from user_id
        UPDATE withdrawal_requests wr
        SET wallet_id = wa.id
        FROM wallet_accounts wa
        WHERE wr.user_id = wa.user_id AND wr.wallet_id IS NULL;

        -- Make wallet_id NOT NULL after populating
        ALTER TABLE withdrawal_requests 
        ALTER COLUMN wallet_id SET NOT NULL;

        -- Add foreign key constraint
        ALTER TABLE withdrawal_requests
        ADD CONSTRAINT fk_withdrawal_wallet 
        FOREIGN KEY (wallet_id) REFERENCES wallet_accounts(id) ON DELETE CASCADE;

        -- Add index
        CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_wallet_id 
        ON withdrawal_requests(wallet_id);
    END IF;
END $$;

-- 3. Create user_devices table for FCM token management
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fcm_token TEXT UNIQUE NOT NULL,
    device_type VARCHAR(50), -- 'android', 'ios', 'web'
    device_name VARCHAR(255),
    app_version VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for user_devices
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_fcm_token ON user_devices(fcm_token);

-- 4. Seed vehicle_types data
-- ============================================================================
-- Note: category constraint allows: 'standard', 'premium', 'luxury', 'suv', 'motorcycle'
INSERT INTO vehicle_types (
    type, display_name, category, seats, base_fare_cents, price_per_km_cents, 
    price_per_minute_cents, minimum_fare_cents, image_url,
    is_active, sort_order, description, features
) VALUES
    -- Motorcycle vehicles
    ('Bajaj', 'Bajaj', 'motorcycle', 3, 5000, 1500, 50, 5000, 
     'https://cdn.example.com/bajaj.png', 
     true, 1, 'Three-wheeler motorcycle taxi - affordable short trips',
     ARRAY['Air Conditioning', 'Quick Pickup']),
    
    -- Standard vehicles  
    ('Minibus', 'Minibus', 'standard', 12, 15000, 2000, 50, 15000, 
     'https://cdn.example.com/minibus.png', 
     true, 2, 'Shared minibus - economical group travel',
     ARRAY['Shared Ride', 'Economical']),
    
    ('Standard Sedan', 'Standard Sedan', 'standard', 4, 8000, 2000, 50, 8000, 
     'https://cdn.example.com/sedan.png', 
     true, 3, 'Comfortable sedan - perfect for city rides',
     ARRAY['Air Conditioning', 'Comfortable Seats', 'GPS Tracking']),
    
    ('Toyota Vitz', 'Toyota Vitz', 'standard', 4, 8000, 2000, 50, 8000, 
     'https://cdn.example.com/vitz.png', 
     true, 4, 'Compact car - efficient and affordable',
     ARRAY['Air Conditioning', 'Fuel Efficient', 'GPS Tracking']),
    
    -- SUV vehicles
    ('SUV', 'SUV', 'suv', 6, 20000, 4000, 100, 20000, 
     'https://cdn.example.com/suv.png', 
     true, 5, 'Spacious SUV - luxury and comfort for families',
     ARRAY['Air Conditioning', 'Luxury Interior', 'Extra Luggage Space', 'Child Seats Available']),
    
    -- Premium vehicles
    ('Premium Sedan', 'Premium Sedan', 'premium', 4, 18000, 3500, 100, 18000, 
     'https://cdn.example.com/premium-sedan.png', 
     true, 6, 'High-end sedan - business and executive travel',
     ARRAY['Air Conditioning', 'Leather Seats', 'Premium Sound System', 'Wi-Fi']),
    
    -- Luxury vehicles
    ('Van', 'Van', 'luxury', 8, 25000, 3000, 75, 25000, 
     'https://cdn.example.com/van.png', 
     true, 7, 'Large van - group transport and events',
     ARRAY['Air Conditioning', 'Large Capacity', 'Luggage Space']),
    
    ('Truck', 'Truck', 'standard', 2, 30000, 5000, 100, 30000, 
     'https://cdn.example.com/truck.png', 
     true, 8, 'Pickup truck - goods and cargo transport',
     ARRAY['Cargo Bed', 'Heavy Load Capacity', 'Tie-Down Points'])
ON CONFLICT (type) DO NOTHING;

-- 5. Update existing vehicle_types if needed (features already added in INSERT)
-- ============================================================================
-- No additional updates needed as features are included in the INSERT statement above

-- 5. Ensure all critical indexes exist
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_verification_status ON driver_profiles(verification_status);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_is_available ON driver_profiles(is_available);
CREATE INDEX IF NOT EXISTS idx_documents_verification_status ON documents(verification_status);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_wallet_accounts_user_id ON wallet_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON wallet_transactions(type);

-- 6. Add updated_at trigger for new tables
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for withdrawal_requests if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_withdrawal_requests_updated_at'
    ) THEN
        CREATE TRIGGER update_withdrawal_requests_updated_at
        BEFORE UPDATE ON withdrawal_requests
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Summary of changes:
-- 1. ✅ Added Chapa payment fields to wallet_transactions
-- 2. ✅ Added wallet_id to withdrawal_requests
-- 3. ✅ Created user_devices table for FCM tokens
-- 4. ✅ Seeded vehicle_types with 8 vehicle types
-- 5. ✅ Added vehicle features metadata
-- 6. ✅ Ensured all critical indexes exist
-- 7. ✅ Added updated_at triggers
-- ============================================================================
