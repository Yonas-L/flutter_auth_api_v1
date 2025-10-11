#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

async function checkSchema() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔍 Checking vehicle_types schema\n');
        
        const cols = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'vehicle_types' 
            ORDER BY ordinal_position
        `);
        
        console.log('Columns in vehicle_types:');
        cols.rows.forEach(c => {
            console.log(`   • ${c.column_name}: ${c.data_type} ${c.is_nullable === 'NO' ? '(NOT NULL)' : ''} ${c.column_default ? `DEFAULT ${c.column_default}` : ''}`);
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkSchema();
