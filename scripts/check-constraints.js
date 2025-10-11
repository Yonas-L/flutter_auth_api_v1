#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

async function checkConstraints() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔍 Checking vehicle_types constraints\n');
        
        const constraints = await pool.query(`
            SELECT 
                con.conname AS constraint_name,
                pg_get_constraintdef(con.oid) AS constraint_definition
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            WHERE rel.relname = 'vehicle_types'
            AND con.contype = 'c'
        `);
        
        console.log('Constraints on vehicle_types:');
        constraints.rows.forEach(c => {
            console.log(`\n   • ${c.constraint_name}:`);
            console.log(`     ${c.constraint_definition}`);
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkConstraints();
