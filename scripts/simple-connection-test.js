#!/usr/bin/env node

/**
 * Simple PostgreSQL Connection Test
 * This script provides detailed error information for connection issues
 */

const { Pool } = require('pg');

async function testConnection() {
    console.log('🔍 Testing PostgreSQL connection with detailed diagnostics...\n');

    const databaseUrl = 'postgresql://db_admin:pOpcQpvbt40h8T9IgU22CExHgoaxdqcA@dpg-d48d0jje5dus73c57ca0-a.oregon-postgres.render.com/arada_main_zvk2_a2eb';

    console.log('📊 Connection Details:');
    console.log(`   Host: dpg-d48d0jje5dus73c57ca0-a.oregon-postgres.render.com`);
    console.log(`   Port: 5432`);
    console.log(`   Database: arada_main_zvk2_a2eb`);
    console.log(`   Username: db_admin`);
    console.log('');

    const pool = new Pool({
        connectionString: databaseUrl,
        ssl: {
            rejectUnauthorized: false
        },
        max: 1,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 10000,
    });

    try {
        console.log('🔌 Attempting connection...');
        const client = await pool.connect();
        console.log('✅ Connection successful!');

        const result = await client.query('SELECT NOW() as current_time');
        console.log(`   Current time: ${result.rows[0].current_time}`);

        client.release();
        console.log('🎉 Connection test passed!');

    } catch (error) {
        console.error('❌ Connection failed:');
        console.error(`   Error Code: ${error.code}`);
        console.error(`   Error Message: ${error.message}`);
        console.error(`   Error Detail: ${error.detail || 'No details available'}`);
        console.error(`   Error Hint: ${error.hint || 'No hint available'}`);
        console.error('');

        if (error.code === 'ECONNREFUSED') {
            console.error('🔧 Troubleshooting:');
            console.error('   - The database server is not running or not accessible');
            console.error('   - Check if the host and port are correct');
            console.error('   - Verify the database is active on Render');
        } else if (error.code === 'ETIMEDOUT') {
            console.error('🔧 Troubleshooting:');
            console.error('   - Connection timeout - check network connectivity');
            console.error('   - Verify your IP is allowed in Render database access control');
            console.error('   - Check if the database is in the correct region');
        } else if (error.code === 'ENOTFOUND') {
            console.error('🔧 Troubleshooting:');
            console.error('   - Hostname not found - check the database URL');
            console.error('   - Verify the database is properly deployed on Render');
        } else if (error.code === '28P01') {
            console.error('🔧 Troubleshooting:');
            console.error('   - Authentication failed - check username and password');
            console.error('   - Verify the database credentials are correct');
        } else if (error.code === '3D000') {
            console.error('🔧 Troubleshooting:');
            console.error('   - Database does not exist - check database name');
            console.error('   - Verify the database was created successfully on Render');
        }

        console.error('');
        console.error('📋 Next Steps:');
        console.error('1. Check Render dashboard for database status');
        console.error('2. Verify access control settings');
        console.error('3. Check if database is in the correct region');
        console.error('4. Try connecting from Render service instead of local machine');

    } finally {
        await pool.end();
    }
}

testConnection().catch(console.error);
