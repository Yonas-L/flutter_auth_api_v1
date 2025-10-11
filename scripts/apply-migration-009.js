#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function applyMigration() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🚀 Applying Migration 009: Fix Schema Alignment\n');
        
        const migrationPath = path.join(__dirname, '../migrations/009_fix_schema_alignment.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('📄 Migration file loaded successfully');
        console.log('⏳ Executing migration...\n');
        
        await pool.query(migrationSQL);
        
        console.log('✅ Migration applied successfully!\n');
        
        // Verify the changes
        console.log('🔍 Verifying changes...\n');
        
        // Check wallet_transactions columns
        const wtCols = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'wallet_transactions' 
            AND column_name IN ('chapa_tx_ref', 'chapa_checkout_url', 'chapa_status', 'payment_method')
        `);
        console.log(`✅ wallet_transactions Chapa fields: ${wtCols.rows.length}/4 added`);
        
        // Check withdrawal_requests wallet_id
        const wrCols = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'withdrawal_requests' AND column_name = 'wallet_id'
        `);
        console.log(`✅ withdrawal_requests.wallet_id: ${wrCols.rows.length > 0 ? 'ADDED' : 'MISSING'}`);
        
        // Check user_devices table
        const udExists = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'user_devices'
        `);
        console.log(`✅ user_devices table: ${udExists.rows.length > 0 ? 'CREATED' : 'MISSING'}`);
        
        // Check vehicle_types data
        const vtCount = await pool.query('SELECT COUNT(*) as count FROM vehicle_types');
        console.log(`✅ vehicle_types rows: ${vtCount.rows[0].count} vehicles seeded\n`);
        
        console.log('🎉 Database schema is now aligned with all codebases!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('\nFull error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

applyMigration();
