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
        console.log('🚀 Applying Migration 012: Add Chapa to Payment Methods\n');
        
        const migrationPath = path.join(__dirname, '../migrations/012_add_chapa_to_payment_methods.sql');
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
            WHERE conname = 'wallet_transactions_payment_method_check'
        `);
        
        if (constraint.rows.length > 0) {
            console.log('Updated constraint:');
            console.log(constraint.rows[0].definition);
        } else {
            console.log('⚠️  Constraint not found, checking if column exists...');
            const column = await pool.query(`
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'wallet_transactions' AND column_name = 'payment_method'
            `);
            console.log('Payment method column:', column.rows);
        }
        
        console.log('\n🎉 Chapa payment method is now supported!');
        console.log('✅ Allowed payment methods: telebirr, cbebirr, mpesa, ebirr, cash, bank_transfer, chapa');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('\nFull error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

applyMigration();
