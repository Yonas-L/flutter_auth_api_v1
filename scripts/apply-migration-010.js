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
        console.log('🚀 Applying Migration 010: Fix Notifications Columns\n');
        
        const migrationPath = path.join(__dirname, '../migrations/010_fix_notifications_columns.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('📄 Migration file loaded successfully');
        console.log('⏳ Executing migration...\n');
        
        await pool.query(migrationSQL);
        
        console.log('✅ Migration applied successfully!\n');
        
        // Verify the changes
        console.log('🔍 Verifying changes...\n');
        
        const cols = await pool.query(`
            SELECT column_name, data_type
            FROM information_schema.columns 
            WHERE table_name = 'notifications' 
            AND column_name IN ('data', 'metadata')
            ORDER BY column_name
        `);
        
        console.log('Notifications table columns added:');
        cols.rows.forEach(c => {
            console.log(`   ✅ ${c.column_name}: ${c.data_type}`);
        });
        
        console.log('\n🎉 Website notifications APIs are now fully compatible!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('\nFull error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

applyMigration();
