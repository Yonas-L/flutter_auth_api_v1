#!/usr/bin/env node

/**
 * Apply Migration 019: Add saved_reports table
 * This script runs the migration to create the saved_reports table for trip reports
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database credentials
const DB_HOST = 'dpg-d48d0jje5dus73c57ca0-a.oregon-postgres.render.com';
const DB_USER = 'db_admin';
const DB_NAME = 'arada_main_zvk2_a2eb';
const DB_PASSWORD = 'pOpcQpvbt40h8T9IgU22CExHgoaxdqcA';

const DB_URL = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}/${DB_NAME}?sslmode=require`;

async function applyMigration() {
    console.log('🚀 Starting migration 019: Add saved_reports table\n');

    const pool = new Pool({
        connectionString: DB_URL,
        ssl: {
            rejectUnauthorized: false
        },
        max: 1,
        connectionTimeoutMillis: 10000,
    });

    try {
        // Test connection
        console.log('🔌 Testing database connection...');
        await pool.query('SELECT NOW()');
        console.log('✅ Database connection successful\n');

        // Read migration file
        const migrationPath = path.join(__dirname, '..', 'migrations', '019_add_saved_reports.sql');
        console.log(`📄 Reading migration file: ${migrationPath}`);
        
        if (!fs.existsSync(migrationPath)) {
            throw new Error(`Migration file not found: ${migrationPath}`);
        }

        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        console.log('✅ Migration SQL loaded\n');

        // Execute migration
        console.log('🔄 Executing migration...');
        await pool.query(migrationSQL);
        console.log('✅ Migration executed successfully\n');

        // Verify table was created
        console.log('🔍 Verifying table creation...');
        const tableCheck = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'saved_reports'
        `);

        if (tableCheck.rows.length > 0) {
            console.log('✅ Table "saved_reports" created successfully\n');

            // Check columns
            const columnsCheck = await pool.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'saved_reports'
                ORDER BY ordinal_position
            `);

            console.log('📊 Table columns:');
            columnsCheck.rows.forEach(col => {
                console.log(`   - ${col.column_name} (${col.data_type})`);
            });

            // Check indexes
            const indexesCheck = await pool.query(`
                SELECT indexname 
                FROM pg_indexes 
                WHERE schemaname = 'public' 
                AND tablename = 'saved_reports'
            `);

            console.log('\n📊 Indexes:');
            indexesCheck.rows.forEach(idx => {
                console.log(`   - ${idx.indexname}`);
            });

        } else {
            throw new Error('Table "saved_reports" was not created');
        }

        console.log('\n✅ Migration 019 completed successfully!');
        console.log('📊 The saved_reports table is now available for storing trip reports.');

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run migration
applyMigration();

