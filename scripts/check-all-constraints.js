#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

async function checkAllConstraints() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔍 CHECKING ALL DATABASE CONSTRAINTS\n');
        console.log('=====================================\n');
        
        // Get all CHECK constraints
        const constraints = await pool.query(`
            SELECT 
                conrelid::regclass AS table_name,
                conname AS constraint_name,
                pg_get_constraintdef(oid) AS constraint_definition
            FROM pg_constraint
            WHERE contype = 'c'
            AND connamespace = 'public'::regnamespace
            ORDER BY conrelid::regclass::text, conname
        `);
        
        console.log('📋 All CHECK Constraints:\n');
        
        let currentTable = '';
        constraints.rows.forEach(row => {
            if (row.table_name !== currentTable) {
                console.log(`\n🔹 ${row.table_name}:`);
                currentTable = row.table_name;
            }
            console.log(`   • ${row.constraint_name}`);
            console.log(`     ${row.constraint_definition}`);
        });
        
        console.log('\n=====================================');
        console.log('✅ Constraint check complete');
        console.log('=====================================\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkAllConstraints();
