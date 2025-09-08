-- Add AfroMessage fields to otp_codes table
-- Migration: 008_add_afromessage_fields_to_otp_codes.sql

-- Add verification_id and message_id columns to otp_codes table
ALTER TABLE otp_codes 
ADD COLUMN IF NOT EXISTS verification_id TEXT,
ADD COLUMN IF NOT EXISTS message_id TEXT;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_otp_codes_verification_id ON otp_codes(verification_id);
CREATE INDEX IF NOT EXISTS idx_otp_codes_message_id ON otp_codes(message_id);

-- Add comments for documentation
COMMENT ON COLUMN otp_codes.verification_id IS 'AfroMessage verification ID for OTP verification';
COMMENT ON COLUMN otp_codes.message_id IS 'AfroMessage message ID for tracking SMS delivery';
