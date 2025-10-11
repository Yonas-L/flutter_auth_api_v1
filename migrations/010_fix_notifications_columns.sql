-- ============================================================================
-- Migration 010: Fix Notifications Table for Website Compatibility
-- Adds missing columns that website APIs expect
-- ============================================================================

-- Add 'data' column for storing additional notification data (JSONB)
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS data JSONB;

-- Add 'metadata' column for storing metadata (JSONB)
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add comment for clarity
COMMENT ON COLUMN notifications.data IS 'Additional data payload for the notification (used by website APIs)';
COMMENT ON COLUMN notifications.metadata IS 'Metadata for tracking and filtering (used by website APIs)';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Summary:
-- ✅ Added 'data' column (JSONB) to notifications table
-- ✅ Added 'metadata' column (JSONB) to notifications table
-- ✅ Website notification APIs now fully compatible
-- ============================================================================
