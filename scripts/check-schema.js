#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

async function checkSchema() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔍 Checking Database Schema\n');
        
        // Check wallet_transactions columns
        console.log('1️⃣ wallet_transactions columns:');
        const wtCols = await pool.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'wallet_transactions' 
            ORDER BY ordinal_position
        `);
        wtCols.rows.forEach(c => {
            console.log(`   • ${c.column_name}: ${c.data_type} ${c.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
        });

        // Check withdrawal_requests columns
        console.log('\n2️⃣ withdrawal_requests columns:');
        const wrCols = await pool.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'withdrawal_requests' 
            ORDER BY ordinal_position
        `);
        wrCols.rows.forEach(c => {
            console.log(`   • ${c.column_name}: ${c.data_type} ${c.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
        });

        // Check if user_devices exists
        console.log('\n3️⃣ Checking for user_devices table:');
        const udExists = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'user_devices'
        `);
        console.log(`   • user_devices exists: ${udExists.rows.length > 0 ? '✅ YES' : '❌ NO'}`);

        // Check vehicle_types data
        console.log('\n4️⃣ Checking vehicle_types data:');
        const vtData = await pool.query('SELECT COUNT(*) as count FROM vehicle_types');
        console.log(`   • vehicle_types rows: ${vtData.rows[0].count}`);

        // Check users table columns for admin fields
        console.log('\n5️⃣ Checking users table for admin fields:');
        const userCols = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND column_name IN ('password_hash', 'temp_password_expires_at', 'must_change_password', 'status')
            ORDER BY column_name
        `);
        console.log(`   • password_hash: ${userCols.rows.find(r => r.column_name === 'password_hash') ? '✅' : '❌'}`);
        console.log(`   • temp_password_expires_at: ${userCols.rows.find(r => r.column_name === 'temp_password_expires_at') ? '✅' : '❌'}`);
        console.log(`   • must_change_password: ${userCols.rows.find(r => r.column_name === 'must_change_password') ? '✅' : '❌'}`);
        console.log(`   • status: ${userCols.rows.find(r => r.column_name === 'status') ? '✅' : '❌'}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkSchema();
