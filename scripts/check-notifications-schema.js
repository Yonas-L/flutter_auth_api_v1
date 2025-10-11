#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

async function checkNotifications() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔍 Checking notifications table schema\n');
        
        // Check actual columns
        const cols = await pool.query(`
            SELECT column_name, data_type
            FROM information_schema.columns 
            WHERE table_name = 'notifications' 
            ORDER BY ordinal_position
        `);
        
        console.log('Current notifications columns:');
        cols.rows.forEach(c => {
            console.log(`   • ${c.column_name}: ${c.data_type}`);
        });
        
        // Check for specific columns needed by website
        const neededCols = ['data', 'metadata'];
        console.log('\n🔍 Checking for website-required columns:');
        
        for (const col of neededCols) {
            const exists = cols.rows.find(r => r.column_name === col);
            if (exists) {
                console.log(`   ✅ ${col}: EXISTS (${exists.data_type})`);
            } else {
                console.log(`   ❌ ${col}: MISSING`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkNotifications();
