-- ============================================================================
-- Migration 012: Add Chapa to Payment Methods
-- Fixes the wallet_transactions_payment_method_check constraint
-- ============================================================================

-- Drop the existing constraint and recreate it with 'chapa' included
DO $$ 
BEGIN
    -- Drop the existing constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'wallet_transactions' 
        AND constraint_name = 'wallet_transactions_payment_method_check'
    ) THEN
        ALTER TABLE wallet_transactions 
        DROP CONSTRAINT wallet_transactions_payment_method_check;
        
        RAISE NOTICE 'Dropped existing payment_method check constraint';
    END IF;
    
    -- Add the updated constraint with chapa included
    ALTER TABLE wallet_transactions 
    ADD CONSTRAINT wallet_transactions_payment_method_check 
    CHECK (payment_method IN ('telebirr', 'cbebirr', 'mpesa', 'ebirr', 'cash', 'bank_transfer', 'chapa'));
    
    RAISE NOTICE 'Added updated payment_method check constraint with chapa support';
END $$;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Summary:
-- ✅ Updated payment_method constraint to include 'chapa'
-- ✅ Now supports: telebirr, cbebirr, mpesa, ebirr, cash, bank_transfer, chapa
-- ============================================================================
