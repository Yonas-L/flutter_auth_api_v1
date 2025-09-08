-- Drop All Tables Script
-- WARNING: This will permanently delete all data!
-- Run this script to clean the database before adding new tables

-- 1. Drop all foreign key constraints
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT
            tc.table_name,
            tc.constraint_name
        FROM information_schema.table_constraints AS tc
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = 'public'
    ) LOOP
        EXECUTE 'ALTER TABLE ' || r.table_name || ' DROP CONSTRAINT IF EXISTS ' || r.constraint_name;
        RAISE NOTICE 'Dropped constraint: % from %', r.constraint_name, r.table_name;
    END LOOP;
END $$;

-- 2. Drop all triggers
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            trigger_name,
            event_object_table
        FROM information_schema.triggers 
        WHERE trigger_schema = 'public'
    ) LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || r.trigger_name || ' ON ' || r.event_object_table;
        RAISE NOTICE 'Dropped trigger: % from %', r.trigger_name, r.event_object_table;
    END LOOP;
END $$;

-- 3. Drop all functions
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            routine_name
        FROM information_schema.routines 
        WHERE routine_schema = 'public'
            AND routine_type = 'FUNCTION'
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.routine_name || ' CASCADE';
        RAISE NOTICE 'Dropped function: %', r.routine_name;
    END LOOP;
END $$;

-- 4. Drop all tables
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
    ) LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || r.table_name || ' CASCADE';
        RAISE NOTICE 'Dropped table: %', r.table_name;
    END LOOP;
END $$;

-- 5. Drop all sequences
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT sequence_name 
        FROM information_schema.sequences 
        WHERE sequence_schema = 'public'
    ) LOOP
        EXECUTE 'DROP SEQUENCE IF EXISTS ' || r.sequence_name || ' CASCADE';
        RAISE NOTICE 'Dropped sequence: %', r.sequence_name;
    END LOOP;
END $$;

-- 6. Drop all custom types
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT typname 
        FROM pg_type 
        WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
            AND typtype = 'e'
    ) LOOP
        EXECUTE 'DROP TYPE IF EXISTS ' || r.typname || ' CASCADE';
        RAISE NOTICE 'Dropped type: %', r.typname;
    END LOOP;
END $$;

-- 7. Verify cleanup
SELECT 
    'Tables' as object_type,
    COUNT(*) as count
FROM information_schema.tables 
WHERE table_schema = 'public'

UNION ALL

SELECT 
    'Functions' as object_type,
    COUNT(*) as count
FROM information_schema.routines 
WHERE routine_schema = 'public'

UNION ALL

SELECT 
    'Sequences' as object_type,
    COUNT(*) as count
FROM information_schema.sequences 
WHERE sequence_schema = 'public';

-- Show final state
SELECT 'Database cleanup completed!' as status;
