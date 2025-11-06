-- Migration: 015_add_user_devices_table.sql
-- Description: Create user_devices table for push notification device token management
-- Created: 2025-11-06

-- =============================================
-- CREATE USER_DEVICES TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.user_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    device_token TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    app_version TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, device_token),
    CONSTRAINT fk_user_device_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- =============================================
-- CREATE INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON public.user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_active ON public.user_devices(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_devices_platform ON public.user_devices(platform);

-- =============================================
-- ADD COMMENTS FOR DOCUMENTATION
-- =============================================

COMMENT ON TABLE public.user_devices IS 'Stores device tokens for push notifications (FCM, APNS, etc.)';
COMMENT ON COLUMN public.user_devices.user_id IS 'User who owns this device';
COMMENT ON COLUMN public.user_devices.device_token IS 'Push notification device token (FCM token, APNS token, etc.)';
COMMENT ON COLUMN public.user_devices.platform IS 'Device platform: ios, android, or web';
COMMENT ON COLUMN public.user_devices.app_version IS 'Application version installed on device';
COMMENT ON COLUMN public.user_devices.is_active IS 'Whether this device token is currently active and should receive notifications';

