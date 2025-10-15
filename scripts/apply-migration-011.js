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
        console.log('🚀 Applying Migration 011: Fix User Type Constraint\n');
        
        const migrationPath = path.join(__dirname, '../migrations/011_fix_user_type_constraint.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('📄 Migration file loaded successfully');
        console.log('⏳ Executing migration...\n');
        
        await pool.query(migrationSQL);
        
        console.log('✅ Migration applied successfully!\n');
        
        // Verify the changes
        console.log('🔍 Verifying changes...\n');
        
        const constraint = await pool.query(`
            SELECT pg_get_constraintdef(oid) as definition
            FROM pg_constraint 
            WHERE conname = 'users_user_type_check'
        `);
        
        console.log('Updated constraint:');
        console.log(constraint.rows[0].definition);
        
        console.log('\n🎉 Admin user creation will now work correctly!');
        console.log('✅ Allowed user types: passenger, driver, admin, customer_support, super_admin');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('\nFull error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

applyMigration();
