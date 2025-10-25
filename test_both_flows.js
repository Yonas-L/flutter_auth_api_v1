/**
 * Test Both Login and Registration OTP Flows
 * Run: node test_both_flows.js
 */

require('dotenv').config();
const { Client } = require('pg');

async function testBothFlows() {
    console.log('🧪 Testing Both Login and Registration OTP Flows...\n');

    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL is missing. Please check your .env file');
        process.exit(1);
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Database connected successfully\n');

        // Test phone number
        const testPhone = '+251931674207';

        console.log('📋 Testing OTP Flow for:', testPhone);
        console.log('');

        // 1. Check if user exists
        console.log('1️⃣ Checking if user exists...');
        const userCheck = await client.query(`
            SELECT id, phone_number, status, user_type, created_at
            FROM users 
            WHERE phone_number = $1
        `, [testPhone]);

        if (userCheck.rows.length > 0) {
            const user = userCheck.rows[0];
            console.log(`✅ User exists: ID=${user.id}, Status=${user.status}, Type=${user.user_type}`);
            console.log(`   Created: ${user.created_at}`);
            console.log('   📱 This phone will use LOGIN flow');
        } else {
            console.log('❌ User does NOT exist');
            console.log('   📱 This phone will use REGISTRATION flow');
        }
        console.log('');

        // 2. Check existing OTP records
        console.log('2️⃣ Checking existing OTP records...');
        const otpCheck = await client.query(`
            SELECT phone_number, purpose, code_hash, expires_at, is_used, created_at
            FROM otp_codes 
            WHERE phone_number = $1
            ORDER BY created_at DESC
            LIMIT 5
        `, [testPhone]);

        if (otpCheck.rows.length > 0) {
            console.log(`📊 Found ${otpCheck.rows.length} OTP record(s):`);
            otpCheck.rows.forEach((otp, idx) => {
                const expired = new Date(otp.expires_at) < new Date();
                const status = otp.is_used ? 'USED' : (expired ? 'EXPIRED' : 'ACTIVE');
                console.log(`   ${idx + 1}. Purpose: ${otp.purpose}, Status: ${status}, Code: ${otp.code_hash}, Created: ${otp.created_at}`);
            });
        } else {
            console.log('📊 No existing OTP records found');
        }
        console.log('');

        // 3. Simulate the expected flow
        console.log('3️⃣ Expected Flow Simulation:');
        console.log('');

        if (userCheck.rows.length > 0) {
            // Existing user - LOGIN flow
            console.log('🔐 LOGIN FLOW (Existing User):');
            console.log('   1. User enters phone on Login screen');
            console.log('   2. App calls AuthService.requestOtp(phone, purpose: "login")');
            console.log('   3. Backend stores OTP with purpose="login"');
            console.log('   4. SMS sent to user');
            console.log('   5. User enters OTP on OTP screen');
            console.log('   6. Backend verifies OTP with purpose="login"');
            console.log('   7. Backend authenticates user and determines redirect');
            
            // Check user's profile status to determine redirect
            const profileCheck = await client.query(`
                SELECT 
                    dp.id as driver_profile_id,
                    dp.verification_status as driver_verification_status,
                    v.id as vehicle_id,
                    COUNT(d.id) as document_count
                FROM users u
                LEFT JOIN driver_profiles dp ON u.id = dp.user_id
                LEFT JOIN vehicles v ON dp.id = v.driver_id
                LEFT JOIN documents d ON u.id = d.user_id AND d.doc_type IN ('driver_license', 'vehicle_registration', 'insurance')
                WHERE u.id = $1
                GROUP BY dp.id, dp.verification_status, v.id
            `, [userCheck.rows[0].id]);

            if (profileCheck.rows.length > 0) {
                const profile = profileCheck.rows[0];
                const hasProfile = !!profile.driver_profile_id;
                const hasVehicle = !!profile.vehicle_id;
                const hasDocuments = parseInt(profile.document_count) > 0;
                
                console.log('   📊 Profile Status:');
                console.log(`      - Driver Profile: ${hasProfile ? 'YES' : 'NO'}`);
                console.log(`      - Vehicle: ${hasVehicle ? 'YES' : 'NO'}`);
                console.log(`      - Documents: ${hasDocuments ? 'YES' : 'NO'}`);
                
                if (!hasProfile || !hasVehicle || !hasDocuments) {
                    console.log('   8. → Redirect to Register1 (incomplete profile)');
                } else if (userCheck.rows[0].status === 'verified' || userCheck.rows[0].status === 'active') {
                    console.log('   8. → Redirect to Home (complete and verified)');
                } else {
                    console.log('   8. → Redirect to Pending Verification (complete but pending)');
                }
            }
        } else {
            // New user - REGISTRATION flow
            console.log('📝 REGISTRATION FLOW (New User):');
            console.log('   1. User clicks "Create Account" on Login screen');
            console.log('   2. User enters phone on PhoneOtp screen');
            console.log('   3. App calls AuthService.requestOtp(phone, purpose: "registration")');
            console.log('   4. Backend stores OTP with purpose="registration"');
            console.log('   5. SMS sent to user');
            console.log('   6. User enters OTP on PhoneOtp screen');
            console.log('   7. Backend verifies OTP with purpose="registration"');
            console.log('   8. Backend creates new user with status="pending_verification"');
            console.log('   9. → Redirect to Register1 (start registration)');
        }

        console.log('');

        // 4. Test database schema
        console.log('4️⃣ Database Schema Verification:');
        
        // Check otp_codes table structure
        const otpSchema = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'otp_codes'
            ORDER BY ordinal_position;
        `);
        
        console.log('📋 otp_codes table structure:');
        otpSchema.rows.forEach(col => {
            console.log(`   - ${col.column_name} (${col.data_type})`);
        });

        console.log('');

        // 5. Environment check
        console.log('5️⃣ Environment Variables Check:');
        const envVars = [
            'DATABASE_URL',
            'AFRO_SMS_KEY', 
            'JWT_ACCESS_SECRET',
            'JWT_REFRESH_SECRET',
            'AFRO_FROM',
            'AFRO_SENDER'
        ];

        envVars.forEach(varName => {
            const value = process.env[varName];
            if (value) {
                console.log(`   ✅ ${varName}: Set (${value.length} chars)`);
            } else {
                console.log(`   ❌ ${varName}: Missing`);
            }
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.end();
    }

    console.log('\n✅ Test complete!');
    console.log('\n📝 Next steps:');
    console.log('  1. Test LOGIN flow: flutter run → Login screen → Enter phone → Verify OTP');
    console.log('  2. Test REGISTRATION flow: flutter run → Create Account → Enter phone → Verify OTP');
    console.log('  3. Check that both flows handle 500 errors gracefully');
    console.log('  4. Verify correct redirects based on user status');
}

testBothFlows();
