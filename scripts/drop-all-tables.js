#!/usr/bin/env node

/**
 * Drop All Tables Script
 * This script will drop all existing tables and related objects from the database
 * WARNING: This will delete all data permanently!
 */

const { Pool } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://db_admin:pOpcQpvbt40h8T9IgU22CExHgoaxdqcA@dpg-d48d0jje5dus73c57ca0-a.oregon-postgres.render.com/arada_main_zvk2_a2eb';

async function dropAllTables() {
    console.log('⚠️  DROP ALL TABLES SCRIPT');
    console.log('==========================');
    console.log('WARNING: This will permanently delete all data!');
    console.log('');

    const pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        // 1. Get list of all tables
        console.log('1️⃣ Getting list of existing tables...');
        const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);

        console.log(`📋 Found ${tablesResult.rows.length} tables to drop:`);
        tablesResult.rows.forEach(row => {
            console.log(`   • ${row.table_name}`);
        });
        console.log('');

        if (tablesResult.rows.length === 0) {
            console.log('✅ No tables found. Database is already clean.');
            return;
        }

        // 2. Drop all foreign key constraints first
        console.log('2️⃣ Dropping foreign key constraints...');
        const fkResult = await pool.query(`
            SELECT
                tc.table_name,
                tc.constraint_name
            FROM information_schema.table_constraints AS tc
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = 'public'
            ORDER BY tc.table_name
        `);

        for (const fk of fkResult.rows) {
            try {
                await pool.query(`ALTER TABLE ${fk.table_name} DROP CONSTRAINT ${fk.constraint_name}`);
                console.log(`   ✅ Dropped constraint: ${fk.constraint_name} from ${fk.table_name}`);
            } catch (error) {
                console.log(`   ⚠️  Could not drop constraint ${fk.constraint_name}: ${error.message}`);
            }
        }
        console.log('');

        // 3. Drop all triggers
        console.log('3️⃣ Dropping triggers...');
        const triggersResult = await pool.query(`
            SELECT 
                trigger_name,
                event_object_table
            FROM information_schema.triggers 
            WHERE trigger_schema = 'public'
            ORDER BY event_object_table, trigger_name
        `);

        for (const trigger of triggersResult.rows) {
            try {
                await pool.query(`DROP TRIGGER IF EXISTS ${trigger.trigger_name} ON ${trigger.event_object_table}`);
                console.log(`   ✅ Dropped trigger: ${trigger.trigger_name} from ${trigger.event_object_table}`);
            } catch (error) {
                console.log(`   ⚠️  Could not drop trigger ${trigger.trigger_name}: ${error.message}`);
            }
        }
        console.log('');

        // 4. Drop all functions
        console.log('4️⃣ Dropping functions...');
        const functionsResult = await pool.query(`
            SELECT 
                routine_name
            FROM information_schema.routines 
            WHERE routine_schema = 'public'
                AND routine_type = 'FUNCTION'
            ORDER BY routine_name
        `);

        for (const func of functionsResult.rows) {
            try {
                await pool.query(`DROP FUNCTION IF EXISTS ${func.routine_name} CASCADE`);
                console.log(`   ✅ Dropped function: ${func.routine_name}`);
            } catch (error) {
                console.log(`   ⚠️  Could not drop function ${func.routine_name}: ${error.message}`);
            }
        }
        console.log('');

        // 5. Drop all tables
        console.log('5️⃣ Dropping tables...');
        for (const table of tablesResult.rows) {
            try {
                await pool.query(`DROP TABLE IF EXISTS ${table.table_name} CASCADE`);
                console.log(`   ✅ Dropped table: ${table.table_name}`);
            } catch (error) {
                console.log(`   ⚠️  Could not drop table ${table.table_name}: ${error.message}`);
            }
        }
        console.log('');

        // 6. Drop all sequences
        console.log('6️⃣ Dropping sequences...');
        const sequencesResult = await pool.query(`
            SELECT sequence_name 
            FROM information_schema.sequences 
            WHERE sequence_schema = 'public'
            ORDER BY sequence_name
        `);

        for (const seq of sequencesResult.rows) {
            try {
                await pool.query(`DROP SEQUENCE IF EXISTS ${seq.sequence_name} CASCADE`);
                console.log(`   ✅ Dropped sequence: ${seq.sequence_name}`);
            } catch (error) {
                console.log(`   ⚠️  Could not drop sequence ${seq.sequence_name}: ${error.message}`);
            }
        }
        console.log('');

        // 7. Drop all types
        console.log('7️⃣ Dropping custom types...');
        const typesResult = await pool.query(`
            SELECT typname 
            FROM pg_type 
            WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
                AND typtype = 'e'
            ORDER BY typname
        `);

        for (const type of typesResult.rows) {
            try {
                await pool.query(`DROP TYPE IF EXISTS ${type.typname} CASCADE`);
                console.log(`   ✅ Dropped type: ${type.typname}`);
            } catch (error) {
                console.log(`   ⚠️  Could not drop type ${type.typname}: ${error.message}`);
            }
        }
        console.log('');

        // 8. Verify cleanup
        console.log('8️⃣ Verifying cleanup...');
        const remainingTables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);

        if (remainingTables.rows.length === 0) {
            console.log('✅ All tables successfully dropped!');
            console.log('✅ Database is now clean and ready for new schema');
        } else {
            console.log(`⚠️  ${remainingTables.rows.length} tables still remain:`);
            remainingTables.rows.forEach(row => {
                console.log(`   • ${row.table_name}`);
            });
        }
        console.log('');

        // 9. Show current database state
        console.log('9️⃣ Current database state...');
        const currentTables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);

        const currentFunctions = await pool.query(`
            SELECT routine_name 
            FROM information_schema.routines 
            WHERE routine_schema = 'public'
        `);

        const currentSequences = await pool.query(`
            SELECT sequence_name 
            FROM information_schema.sequences 
            WHERE sequence_schema = 'public'
        `);

        console.log(`📊 Current state:`);
        console.log(`   • Tables: ${currentTables.rows.length}`);
        console.log(`   • Functions: ${currentFunctions.rows.length}`);
        console.log(`   • Sequences: ${currentSequences.rows.length}`);
        console.log('');
        console.log('🎉 Database cleanup completed!');
        console.log('Ready to create new schema with your custom tables.');

    } catch (error) {
        console.error('❌ Error during cleanup:', error.message);
        console.error('Error details:', error);
    } finally {
        await pool.end();
    }
}

// Run the cleanup
dropAllTables().catch(console.error);
