#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

async function verifyWebsiteCompatibility() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🎯 WEBSITE DATABASE COMPATIBILITY CHECK\n');
        console.log('=====================================\n');
        
        let allGood = true;
        
        // 1. Check wallet_transactions for Chapa fields
        console.log('1️⃣ Wallet Transactions (Chapa Integration):');
        const wtCols = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'wallet_transactions' 
            AND column_name IN ('chapa_tx_ref', 'chapa_checkout_url', 'chapa_status', 'payment_method')
            ORDER BY column_name
        `);
        if (wtCols.rows.length === 4) {
            console.log('   ✅ All Chapa payment fields present');
        } else {
            console.log(`   ❌ Missing Chapa fields (found ${wtCols.rows.length}/4)`);
            allGood = false;
        }
        
        // 2. Check withdrawal_requests structure
        console.log('\n2️⃣ Withdrawal Requests:');
        const wrCols = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'withdrawal_requests' 
            AND column_name IN ('wallet_id', 'amount_cents', 'bank_name', 'account_number', 'account_holder_name', 'status')
            ORDER BY column_name
        `);
        if (wrCols.rows.length === 6) {
            console.log('   ✅ All required columns present');
        } else {
            console.log(`   ❌ Missing columns (found ${wrCols.rows.length}/6)`);
            allGood = false;
        }
        
        // 3. Check notifications table
        console.log('\n3️⃣ Notifications Table:');
        const notifCols = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'notifications' 
            AND column_name IN ('data', 'metadata', 'type', 'reference_id', 'reference_type', 'is_read')
            ORDER BY column_name
        `);
        if (notifCols.rows.length === 6) {
            console.log('   ✅ All required columns present');
        } else {
            console.log(`   ❌ Missing columns (found ${notifCols.rows.length}/6)`);
            allGood = false;
        }
        
        // 4. Check user_devices table
        console.log('\n4️⃣ User Devices (FCM Tokens):');
        const udExists = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'user_devices'
        `);
        if (udExists.rows.length > 0) {
            console.log('   ✅ Table exists');
            const udCols = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'user_devices' 
                AND column_name IN ('fcm_token', 'device_type', 'user_id')
            `);
            if (udCols.rows.length === 3) {
                console.log('   ✅ All required columns present');
            } else {
                console.log(`   ❌ Missing columns (found ${udCols.rows.length}/3)`);
                allGood = false;
            }
        } else {
            console.log('   ❌ Table missing');
            allGood = false;
        }
        
        // 5. Check documents table
        console.log('\n5️⃣ Documents Table:');
        const docCols = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'documents' 
            AND column_name IN ('doc_type', 'verification_status', 'user_id', 'file_name', 'public_url')
            ORDER BY column_name
        `);
        if (docCols.rows.length === 5) {
            console.log('   ✅ All required columns present');
        } else {
            console.log(`   ❌ Missing columns (found ${docCols.rows.length}/5)`);
            allGood = false;
        }
        
        // 6. Check driver_profiles table
        console.log('\n6️⃣ Driver Profiles:');
        const dpCols = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'driver_profiles' 
            AND column_name IN ('user_id', 'verification_status', 'is_available', 'rating_avg', 'total_trips')
            ORDER BY column_name
        `);
        if (dpCols.rows.length === 5) {
            console.log('   ✅ All required columns present');
        } else {
            console.log(`   ❌ Missing columns (found ${dpCols.rows.length}/5)`);
            allGood = false;
        }
        
        // 7. Check users table
        console.log('\n7️⃣ Users Table:');
        const userCols = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND column_name IN ('full_name', 'email', 'phone_number', 'user_type', 'status', 'is_active')
            ORDER BY column_name
        `);
        if (userCols.rows.length === 6) {
            console.log('   ✅ All required columns present');
        } else {
            console.log(`   ❌ Missing columns (found ${userCols.rows.length}/6)`);
            allGood = false;
        }
        
        // 8. Check wallet_accounts table
        console.log('\n8️⃣ Wallet Accounts:');
        const waCols = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'wallet_accounts' 
            AND column_name IN ('user_id', 'balance_cents', 'currency', 'is_active')
            ORDER BY column_name
        `);
        if (waCols.rows.length === 4) {
            console.log('   ✅ All required columns present');
        } else {
            console.log(`   ❌ Missing columns (found ${waCols.rows.length}/4)`);
            allGood = false;
        }
        
        // 9. Check trips table
        console.log('\n9️⃣ Trips Table:');
        const tripCols = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'trips' 
            AND column_name IN ('passenger_id', 'driver_id', 'vehicle_id', 'status', 'pickup_address', 'dropoff_address')
            ORDER BY column_name
        `);
        if (tripCols.rows.length === 6) {
            console.log('   ✅ All required columns present');
        } else {
            console.log(`   ❌ Missing columns (found ${tripCols.rows.length}/6)`);
            allGood = false;
        }
        
        // 10. Check vehicle_types with data
        console.log('\n🔟 Vehicle Types:');
        const vtCount = await pool.query('SELECT COUNT(*) as count FROM vehicle_types');
        if (parseInt(vtCount.rows[0].count) > 0) {
            console.log(`   ✅ Vehicle types seeded (${vtCount.rows[0].count} types)`);
        } else {
            console.log('   ❌ No vehicle types seeded');
            allGood = false;
        }
        
        console.log('\n=====================================');
        if (allGood) {
            console.log('✅ ALL CHECKS PASSED!');
            console.log('🎉 Website is fully compatible with database!');
        } else {
            console.log('❌ SOME CHECKS FAILED');
            console.log('⚠️  Please review the issues above');
        }
        console.log('=====================================\n');
        
    } catch (error) {
        console.error('❌ Verification failed:', error.message);
    } finally {
        await pool.end();
    }
}

verifyWebsiteCompatibility();
