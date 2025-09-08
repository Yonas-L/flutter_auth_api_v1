#!/usr/bin/env node

/**
 * Test PostgreSQL Connection Script
 * This script tests the connection to the hosted PostgreSQL database
 */

const { Pool } = require('pg');
require('dotenv').config();

async function testPostgresConnection() {
    console.log('🚀 Testing PostgreSQL connection...\n');

    // Get database URL from environment
    const databaseUrl = process.env.DATABASE_URL || 'postgresql://db_admin:7snpqJqfviJZ9bSo6ZXkvdQi9OXsqb9f@dpg-d2v8n0re5dus73fe8170-a.oregon-postgres.render.com/arada_main';

    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found in environment variables');
        process.exit(1);
    }

    console.log('📊 Connection Details:');
    console.log(`   URL: ${databaseUrl.replace(/:[^:]*@/, ':***@')}`); // Hide password
    console.log('');

    const pool = new Pool({
        connectionString: databaseUrl,
        ssl: {
            rejectUnauthorized: false // Required for Render PostgreSQL
        },
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    });

    try {
        // Test basic connection
        console.log('🔌 Testing basic connection...');
        const client = await pool.connect();

        // Get database info
        const versionResult = await client.query('SELECT version()');
        const timeResult = await client.query('SELECT NOW() as current_time');

        console.log('✅ Connection successful!');
        console.log(`   PostgreSQL Version: ${versionResult.rows[0].version.split(' ')[0]} ${versionResult.rows[0].version.split(' ')[1]}`);
        console.log(`   Current Time: ${timeResult.rows[0].current_time}`);
        console.log('');

        // Test table creation (if not exists)
        console.log('📋 Testing table operations...');

        // Check if tables exist
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);

        console.log(`   Found ${tablesResult.rows.length} tables:`);
        tablesResult.rows.forEach(row => {
            console.log(`   - ${row.table_name}`);
        });
        console.log('');

        // Test UUID extension
        console.log('🔧 Testing UUID extension...');
        const uuidResult = await client.query('SELECT uuid_generate_v4() as test_uuid');
        console.log(`   UUID generated: ${uuidResult.rows[0].test_uuid}`);
        console.log('');

        // Test basic CRUD operations
        console.log('📝 Testing basic CRUD operations...');

        // Create a test table
        await client.query(`
            CREATE TABLE IF NOT EXISTS test_connection (
                id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
                name text NOT NULL,
                created_at timestamp with time zone DEFAULT now()
            )
        `);
        console.log('   ✅ Test table created');

        // Insert test data
        const insertResult = await client.query(
            'INSERT INTO test_connection (name) VALUES ($1) RETURNING *',
            ['PostgreSQL Connection Test']
        );
        console.log(`   ✅ Test data inserted: ${insertResult.rows[0].id}`);

        // Select test data
        const selectResult = await client.query('SELECT * FROM test_connection WHERE name = $1', ['PostgreSQL Connection Test']);
        console.log(`   ✅ Test data retrieved: ${selectResult.rows.length} rows`);

        // Clean up test table
        await client.query('DROP TABLE test_connection');
        console.log('   ✅ Test table cleaned up');
        console.log('');

        client.release();

        console.log('🎉 All tests passed! PostgreSQL connection is working correctly.');
        console.log('');
        console.log('Next steps:');
        console.log('1. Update your .env file with the DATABASE_URL');
        console.log('2. Run the migration script to create the schema');
        console.log('3. Test the backend API endpoints');

    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        console.error('');
        console.error('Troubleshooting:');
        console.error('1. Check if the DATABASE_URL is correct');
        console.error('2. Verify the database is accessible from your IP');
        console.error('3. Check if the database credentials are correct');
        console.error('4. Ensure the database exists on Render');
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run the test
testPostgresConnection().catch(console.error);
