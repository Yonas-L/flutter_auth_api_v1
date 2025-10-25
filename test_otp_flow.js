/**
 * Test OTP Flow - Quick diagnostic script
 * Run: node test_otp_flow.js
 */

require('dotenv').config();
const { Client } = require('pg');

async function testOtpFlow() {
    console.log('🧪 Testing OTP Flow...\n');

    // Check environment variables
    console.log('📋 Environment Variables Check:');
    console.log('  DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Missing');
    console.log('  AFRO_SMS_KEY:', process.env.AFRO_SMS_KEY ? '✅ Set' : '❌ Missing');
    console.log('  JWT_ACCESS_SECRET:', process.env.JWT_ACCESS_SECRET ? '✅ Set' : '❌ Missing');
    console.log('  JWT_REFRESH_SECRET:', process.env.JWT_REFRESH_SECRET ? '✅ Set' : '❌ Missing');
    console.log('');

    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL is missing. Please check your .env file');
        process.exit(1);
    }

    // Test database connection
    console.log('🔗 Testing database connection...');
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Database connected successfully\n');

        // Check if otp_codes table exists
        console.log('📊 Checking database schema...');
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'otp_codes'
            );
        `);

        if (tableCheck.rows[0].exists) {
            console.log('✅ otp_codes table exists');

            // Get table structure
            const structure = await client.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'otp_codes'
                ORDER BY ordinal_position;
            `);

            console.log('\n📋 Table structure:');
            structure.rows.forEach(col => {
                console.log(`  - ${col.column_name} (${col.data_type}, ${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
            });

            // Check for existing OTP records
            const otpCount = await client.query('SELECT COUNT(*) FROM otp_codes');
            console.log(`\n📊 Existing OTP records: ${otpCount.rows[0].count}`);

            // Show recent OTP records (last 5)
            const recentOtps = await client.query(`
                SELECT phone_number, purpose, created_at, expires_at, is_used
                FROM otp_codes
                ORDER BY created_at DESC
                LIMIT 5
            `);

            if (recentOtps.rows.length > 0) {
                console.log('\n📋 Recent OTP records:');
                recentOtps.rows.forEach((otp, idx) => {
                    console.log(`  ${idx + 1}. Phone: ${otp.phone_number}, Purpose: ${otp.purpose}, Used: ${otp.is_used}, Expires: ${otp.expires_at}`);
                });
            }
        } else {
            console.log('❌ otp_codes table does NOT exist');
            console.log('   You need to run database migrations first!');
            console.log('   Run: npm run migrate:up');
        }

        console.log('');

        // Check if users table exists
        const usersCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'users'
            );
        `);

        if (usersCheck.rows[0].exists) {
            console.log('✅ users table exists');

            // Check for drivers
            const driversCount = await client.query(`
                SELECT COUNT(*) FROM users WHERE user_type = 'driver'
            `);
            console.log(`📊 Registered drivers: ${driversCount.rows[0].count}`);

            if (driversCount.rows[0].count > 0) {
                console.log('\n📋 Sample drivers:');
                const drivers = await client.query(`
                    SELECT phone_number, status, created_at
                    FROM users
                    WHERE user_type = 'driver'
                    ORDER BY created_at DESC
                    LIMIT 3
                `);
                drivers.rows.forEach((driver, idx) => {
                    console.log(`  ${idx + 1}. Phone: ${driver.phone_number}, Status: ${driver.status}`);
                });
            } else {
                console.log('ℹ️  No drivers registered yet');
            }
        } else {
            console.log('❌ users table does NOT exist');
            console.log('   You need to run database migrations first!');
        }

    } catch (error) {
        console.error('❌ Database error:', error.message);
        if (error.code === 'ENOTFOUND') {
            console.error('   Could not connect to database host');
        } else if (error.code === '28P01') {
            console.error('   Authentication failed - check DATABASE_URL credentials');
        }
    } finally {
        await client.end();
    }

    console.log('\n✅ Test complete!');
    console.log('\n📝 Next steps:');
    console.log('  1. If tables are missing, run: npm run migrate:up');
    console.log('  2. Start the backend: npm run start:dev');
    console.log('  3. Test from Flutter app');
}

testOtpFlow();
