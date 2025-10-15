#!/usr/bin/env node

const { Pool } = require('pg');
require('dotenv').config();

async function testUserCreation() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🧪 TESTING USER CREATION COMPATIBILITY\n');
        console.log('=====================================\n');
        
        // 1. Check user_type constraint
        console.log('1️⃣ Checking user_type constraint:');
        const userTypeConstraint = await pool.query(`
            SELECT pg_get_constraintdef(oid) as definition
            FROM pg_constraint 
            WHERE conname = 'users_user_type_check'
        `);
        console.log('   Allowed values:', userTypeConstraint.rows[0].definition);
        
        // Extract allowed values
        const allowedTypes = userTypeConstraint.rows[0].definition
            .match(/ARRAY\[(.*?)\]/)[1]
            .split(',')
            .map(v => v.replace(/::text|'/g, '').trim());
        
        console.log('   ✅ Allowed types:', allowedTypes.join(', '));
        
        // 2. Check if required types are allowed
        console.log('\n2️⃣ Checking website required user types:');
        const requiredTypes = ['admin', 'customer_support', 'super_admin'];
        
        requiredTypes.forEach(type => {
            if (allowedTypes.includes(type)) {
                console.log(`   ✅ ${type}: ALLOWED`);
            } else {
                console.log(`   ❌ ${type}: NOT ALLOWED - Will cause error!`);
            }
        });
        
        // 3. Check roles table
        console.log('\n3️⃣ Checking roles table:');
        const roles = await pool.query('SELECT id, name, is_active FROM roles ORDER BY name');
        console.log('   Available roles:');
        roles.rows.forEach(role => {
            const status = role.is_active ? '✅ Active' : '⚠️ Inactive';
            console.log(`   ${status} ${role.name} (id: ${role.id})`);
        });
        
        // 4. Check if website can create users
        console.log('\n4️⃣ Testing simulated user creation:');
        
        const testCases = [
            { user_type: 'admin', role: 'admin' },
            { user_type: 'customer_support', role: 'customer_support' }
        ];
        
        for (const testCase of testCases) {
            // Check if user_type is allowed
            const typeAllowed = allowedTypes.includes(testCase.user_type);
            
            // Check if role exists
            const roleExists = roles.rows.find(r => r.name === testCase.role && r.is_active);
            
            if (typeAllowed && roleExists) {
                console.log(`   ✅ user_type='${testCase.user_type}' with role='${testCase.role}': WILL WORK`);
            } else {
                if (!typeAllowed) {
                    console.log(`   ❌ user_type='${testCase.user_type}': CONSTRAINT VIOLATION`);
                }
                if (!roleExists) {
                    console.log(`   ❌ role='${testCase.role}': ROLE NOT FOUND`);
                }
            }
        }
        
        // 5. Check for any other potential issues
        console.log('\n5️⃣ Checking for other potential issues:');
        
        // Check if users table has all required columns
        const userCols = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND column_name IN ('email', 'full_name', 'user_type', 'password_hash', 'is_active', 'status', 'phone_number', 'temp_password_expires_at', 'must_change_password')
            ORDER BY column_name
        `);
        
        const requiredCols = ['email', 'full_name', 'user_type', 'password_hash', 'is_active', 'status', 'phone_number', 'temp_password_expires_at', 'must_change_password'];
        const missingCols = requiredCols.filter(col => !userCols.rows.find(r => r.column_name === col));
        
        if (missingCols.length === 0) {
            console.log('   ✅ All required columns present in users table');
        } else {
            console.log('   ❌ Missing columns:', missingCols.join(', '));
        }
        
        // Check user_roles table
        const userRolesCols = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'user_roles' 
            AND column_name IN ('user_id', 'role_id')
        `);
        
        if (userRolesCols.rows.length === 2) {
            console.log('   ✅ user_roles table has required columns');
        } else {
            console.log('   ❌ user_roles table missing required columns');
        }
        
        console.log('\n=====================================');
        console.log('✅ Compatibility check complete!');
        console.log('=====================================\n');
        
        // Final verdict
        const allGood = allowedTypes.includes('admin') && 
                       allowedTypes.includes('customer_support') &&
                       roles.rows.find(r => r.name === 'admin' && r.is_active) &&
                       roles.rows.find(r => r.name === 'customer_support' && r.is_active) &&
                       missingCols.length === 0;
        
        if (allGood) {
            console.log('🎉 All checks passed! User creation should work correctly.');
        } else {
            console.log('⚠️  Some issues detected. User creation may fail.');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

testUserCreation();
