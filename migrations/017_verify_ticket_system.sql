-- Migration: 017_verify_ticket_system.sql
-- Description: Verification script to check if all required tables and columns exist for ticket management system
-- Created: 2025-11-06
-- NOTE: This is a verification script, not a migration. Run it to check your database state.

-- =============================================
-- VERIFY SUPPORT_TICKETS TABLE
-- =============================================

DO $$
BEGIN
    -- Check if support_tickets table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'support_tickets') THEN
        RAISE EXCEPTION '❌ support_tickets table does not exist. Please run migration 002_unified_schema.sql';
    ELSE
        RAISE NOTICE '✅ support_tickets table exists';
    END IF;

    -- Check required columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'id') THEN
        RAISE EXCEPTION '❌ support_tickets.id column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'user_id') THEN
        RAISE EXCEPTION '❌ support_tickets.user_id column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'assigned_to_user_id') THEN
        RAISE EXCEPTION '❌ support_tickets.assigned_to_user_id column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'subject') THEN
        RAISE EXCEPTION '❌ support_tickets.subject column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'message') THEN
        RAISE EXCEPTION '❌ support_tickets.message column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'status') THEN
        RAISE EXCEPTION '❌ support_tickets.status column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'priority') THEN
        RAISE EXCEPTION '❌ support_tickets.priority column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'category') THEN
        RAISE EXCEPTION '❌ support_tickets.category column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'created_at') THEN
        RAISE EXCEPTION '❌ support_tickets.created_at column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'support_tickets' AND column_name = 'updated_at') THEN
        RAISE EXCEPTION '❌ support_tickets.updated_at column missing';
    END IF;

    RAISE NOTICE '✅ All required columns exist in support_tickets table';
END $$;

-- =============================================
-- VERIFY TICKET_RESPONSES TABLE
-- =============================================

DO $$
BEGIN
    -- Check if ticket_responses table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ticket_responses') THEN
        RAISE EXCEPTION '❌ ticket_responses table does not exist. Please run migration 014_add_ticket_responses_table.sql';
    ELSE
        RAISE NOTICE '✅ ticket_responses table exists';
    END IF;

    -- Check required columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_responses' AND column_name = 'id') THEN
        RAISE EXCEPTION '❌ ticket_responses.id column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_responses' AND column_name = 'ticket_id') THEN
        RAISE EXCEPTION '❌ ticket_responses.ticket_id column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_responses' AND column_name = 'user_id') THEN
        RAISE EXCEPTION '❌ ticket_responses.user_id column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_responses' AND column_name = 'message') THEN
        RAISE EXCEPTION '❌ ticket_responses.message column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_responses' AND column_name = 'is_read') THEN
        RAISE EXCEPTION '❌ ticket_responses.is_read column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_responses' AND column_name = 'created_at') THEN
        RAISE EXCEPTION '❌ ticket_responses.created_at column missing';
    END IF;

    RAISE NOTICE '✅ All required columns exist in ticket_responses table';
END $$;

-- =============================================
-- VERIFY USERS TABLE COLUMNS (for JOIN queries)
-- =============================================

DO $$
BEGIN
    -- Check if users table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
        RAISE EXCEPTION '❌ users table does not exist';
    ELSE
        RAISE NOTICE '✅ users table exists';
    END IF;

    -- Check required columns for JOIN queries
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id') THEN
        RAISE EXCEPTION '❌ users.id column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'full_name') THEN
        RAISE EXCEPTION '❌ users.full_name column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email') THEN
        RAISE EXCEPTION '❌ users.email column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'phone_number') THEN
        RAISE EXCEPTION '❌ users.phone_number column missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'user_type') THEN
        RAISE EXCEPTION '❌ users.user_type column missing';
    END IF;

    RAISE NOTICE '✅ All required columns exist in users table';
END $$;

-- =============================================
-- VERIFY INDEXES
-- =============================================

DO $$
BEGIN
    -- Check critical indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'support_tickets' AND indexname = 'idx_support_tickets_user_id') THEN
        RAISE WARNING '⚠️ idx_support_tickets_user_id index missing. Run migration 016_add_ticket_indexes.sql';
    ELSE
        RAISE NOTICE '✅ idx_support_tickets_user_id index exists';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'ticket_responses' AND indexname = 'idx_ticket_responses_ticket_id') THEN
        RAISE WARNING '⚠️ idx_ticket_responses_ticket_id index missing. Run migration 014_add_ticket_responses_table.sql';
    ELSE
        RAISE NOTICE '✅ idx_ticket_responses_ticket_id index exists';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'ticket_responses' AND indexname = 'idx_ticket_responses_unread') THEN
        RAISE WARNING '⚠️ idx_ticket_responses_unread index missing. Run migration 014_add_ticket_responses_table.sql';
    ELSE
        RAISE NOTICE '✅ idx_ticket_responses_unread index exists';
    END IF;
END $$;

-- =============================================
-- VERIFY FOREIGN KEY CONSTRAINTS
-- =============================================

DO $$
BEGIN
    -- Check foreign key from ticket_responses to support_tickets
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'ticket_responses' 
        AND constraint_name = 'fk_ticket_response_ticket'
    ) THEN
        RAISE WARNING '⚠️ Foreign key fk_ticket_response_ticket missing';
    ELSE
        RAISE NOTICE '✅ Foreign key fk_ticket_response_ticket exists';
    END IF;

    -- Check foreign key from ticket_responses to users
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'ticket_responses' 
        AND constraint_name = 'fk_ticket_response_user'
    ) THEN
        RAISE WARNING '⚠️ Foreign key fk_ticket_response_user missing';
    ELSE
        RAISE NOTICE '✅ Foreign key fk_ticket_response_user exists';
    END IF;
END $$;

-- =============================================
-- SUMMARY
-- =============================================

SELECT 
    'Database Verification Complete' as status,
    'All required tables and columns for ticket management system' as message;

