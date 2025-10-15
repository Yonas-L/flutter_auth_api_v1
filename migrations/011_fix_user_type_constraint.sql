-- ============================================================================
-- Migration 011: Fix User Type Constraint for Admin User Creation
-- Adds 'customer_support' and 'super_admin' to allowed user_type values
-- ============================================================================

-- Drop the old constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_type_check;

-- Add the new constraint with all required user types
ALTER TABLE users ADD CONSTRAINT users_user_type_check
CHECK (user_type = ANY (ARRAY['passenger'::text, 'driver'::text, 'admin'::text, 'customer_support'::text, 'super_admin'::text]));

-- Add comment for clarity
COMMENT ON CONSTRAINT users_user_type_check ON users IS 
'Allowed user types: passenger, driver, admin, customer_support, super_admin';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Summary:
-- ✅ Updated user_type constraint to allow 'customer_support' and 'super_admin'
-- ✅ Website can now create admin and customer_support users
-- ============================================================================
