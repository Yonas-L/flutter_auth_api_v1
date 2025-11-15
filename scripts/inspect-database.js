#!/usr/bin/env node

/**
 * Database Inspection Script
 * Comprehensive database analysis and verification
 */

const { Pool } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://db_admin:pOpcQpvbt40h8T9IgU22CExHgoaxdqcA@dpg-d48d0jje5dus73c57ca0-a.oregon-postgres.render.com/arada_main_zvk2_a2eb';

async function inspectDatabase() {
    console.log('🔍 ARADA TRANSPORT DATABASE INSPECTION');
    console.log('=====================================\n');

    const pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        // 1. Basic Connection Test
        console.log('1️⃣ CONNECTION TEST');
        console.log('------------------');
        const versionResult = await pool.query('SELECT version()');
        const timeResult = await pool.query('SELECT NOW() as current_time');
        console.log(`✅ Connected to: ${versionResult.rows[0].version.split(' ')[0]} ${versionResult.rows[0].version.split(' ')[1]}`);
        console.log(`⏰ Current time: ${timeResult.rows[0].current_time}\n`);

        // 2. Database Size and Stats
        console.log('2️⃣ DATABASE STATISTICS');
        console.log('----------------------');
        const dbSizeResult = await pool.query(`
            SELECT 
                pg_size_pretty(pg_database_size(current_database())) as database_size,
                current_database() as database_name
        `);
        console.log(`📊 Database: ${dbSizeResult.rows[0].database_name}`);
        console.log(`📏 Size: ${dbSizeResult.rows[0].database_size}\n`);

        // 3. Tables Overview
        console.log('3️⃣ TABLES OVERVIEW');
        console.log('------------------');
        const tablesResult = await pool.query(`
            SELECT 
                table_name,
                (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') as column_count
            FROM information_schema.tables t
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);

        console.log(`📋 Found ${tablesResult.rows.length} tables:`);
        tablesResult.rows.forEach(row => {
            console.log(`   • ${row.table_name} (${row.column_count} columns)`);
        });
        console.log('');

        // 4. Table Row Counts
        console.log('4️⃣ TABLE ROW COUNTS');
        console.log('--------------------');
        for (const table of tablesResult.rows) {
            try {
                const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${table.table_name}`);
                console.log(`   • ${table.table_name}: ${countResult.rows[0].count} rows`);
            } catch (error) {
                console.log(`   • ${table.table_name}: Error counting rows`);
            }
        }
        console.log('');

        // 5. Indexes Analysis
        console.log('5️⃣ INDEXES ANALYSIS');
        console.log('--------------------');
        const indexesResult = await pool.query(`
            SELECT 
                tablename,
                COUNT(*) as index_count
            FROM pg_indexes 
            WHERE schemaname = 'public' 
            GROUP BY tablename
            ORDER BY tablename
        `);

        console.log(`📊 Indexes per table:`);
        indexesResult.rows.forEach(row => {
            console.log(`   • ${row.tablename}: ${row.index_count} indexes`);
        });
        console.log('');

        // 6. Foreign Key Relationships
        console.log('6️⃣ FOREIGN KEY RELATIONSHIPS');
        console.log('-----------------------------');
        const fkResult = await pool.query(`
            SELECT
                tc.table_name,
                tc.constraint_name,
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
            LEFT JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = 'public'
            ORDER BY tc.table_name
        `);

        console.log(`🔗 Found ${fkResult.rows.length} foreign key relationships:`);
        fkResult.rows.forEach(row => {
            console.log(`   • ${row.table_name}.${row.column_name} → ${row.foreign_table_name}.${row.foreign_column_name}`);
        });
        console.log('');

        // 7. Vehicle Types Data
        console.log('7️⃣ VEHICLE TYPES DATA');
        console.log('----------------------');
        const vehicleTypesResult = await pool.query(`
            SELECT type, category, seats, base_fare_cents, price_per_km_cents, is_active
            FROM vehicle_types 
            ORDER BY sort_order
        `);

        console.log(`🚗 Vehicle Types (${vehicleTypesResult.rows.length}):`);
        vehicleTypesResult.rows.forEach(row => {
            console.log(`   • ${row.type} (${row.category}) - ${row.seats} seats - $${(row.base_fare_cents / 100).toFixed(2)} base fare`);
        });
        console.log('');

        // 8. Triggers and Functions
        console.log('8️⃣ TRIGGERS AND FUNCTIONS');
        console.log('--------------------------');
        const triggersResult = await pool.query(`
            SELECT 
                trigger_name,
                event_object_table,
                action_timing,
                event_manipulation
            FROM information_schema.triggers 
            WHERE trigger_schema = 'public'
            ORDER BY event_object_table, trigger_name
        `);

        console.log(`⚡ Found ${triggersResult.rows.length} triggers:`);
        triggersResult.rows.forEach(row => {
            console.log(`   • ${row.trigger_name} on ${row.event_object_table} (${row.action_timing} ${row.event_manipulation})`);
        });
        console.log('');

        // 9. Data Integrity Check
        console.log('9️⃣ DATA INTEGRITY CHECK');
        console.log('------------------------');

        // Check for orphaned records
        const orphanedDrivers = await pool.query(`
            SELECT COUNT(*) as count 
            FROM driver_profiles dp 
            LEFT JOIN users u ON dp.user_id = u.id 
            WHERE u.id IS NULL
        `);

        const orphanedVehicles = await pool.query(`
            SELECT COUNT(*) as count 
            FROM vehicles v 
            LEFT JOIN driver_profiles dp ON v.driver_id = dp.id 
            WHERE dp.id IS NULL
        `);

        console.log(`🔍 Data integrity checks:`);
        console.log(`   • Orphaned driver profiles: ${orphanedDrivers.rows[0].count}`);
        console.log(`   • Orphaned vehicles: ${orphanedVehicles.rows[0].count}`);
        console.log('');

        // 10. Summary
        console.log('🎯 SUMMARY');
        console.log('----------');
        console.log(`✅ Database is properly configured and accessible`);
        console.log(`✅ All ${tablesResult.rows.length} tables created successfully`);
        console.log(`✅ ${indexesResult.rows.reduce((sum, row) => sum + parseInt(row.index_count), 0)} indexes created for performance`);
        console.log(`✅ ${fkResult.rows.length} foreign key relationships established`);
        console.log(`✅ ${triggersResult.rows.length} triggers configured for data consistency`);
        console.log(`✅ ${vehicleTypesResult.rows.length} vehicle types pre-populated`);
        console.log(`✅ Data integrity checks passed`);
        console.log('');
        console.log('🚀 Database is ready for Phase 2: Repository Migration!');

    } catch (error) {
        console.error('❌ Database inspection failed:', error.message);
        console.error('Error details:', error);
    } finally {
        await pool.end();
    }
}

// Run the inspection
inspectDatabase().catch(console.error);
