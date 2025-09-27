const axios = require('axios');

// Backend server URL (deployed on Render)
const BASE_URL = 'https://flutter-auth-api-v1.onrender.com';

// Test user credentials - using existing user from the system
const TEST_USER = {
    email: 'yonas@arada.co'
};

let authToken = '';

async function authenticateWithOtp() {
    try {
        console.log('📧 Requesting OTP...');
        const otpResponse = await axios.post(`${BASE_URL}/auth/otp/request`, {
            email: TEST_USER.email
        });
        
        console.log('✅ OTP request sent');
        console.log('⚠️  Please check your email for the OTP code');
        console.log('⚠️  For testing purposes, using a mock token instead');
        
        // For testing, we'll use a mock JWT token structure
        // In real scenario, user would enter OTP from email
        authToken = 'mock_jwt_token_for_testing';
        console.log('✅ Using mock authentication for testing');
        return true;
    } catch (error) {
        console.error('❌ OTP request failed:', error.response?.data || error.message);
        return false;
    }
}

async function testWalletBalance() {
    try {
        console.log('\n💰 Testing wallet balance...');
        const response = await axios.get(`${BASE_URL}/wallet/balance`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        console.log('✅ Wallet balance retrieved:');
        console.log(JSON.stringify(response.data, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Wallet balance test failed:', error.response?.data || error.message);
        return false;
    }
}

async function testWalletTransactions() {
    try {
        console.log('\n📊 Testing wallet transactions...');
        const response = await axios.get(`${BASE_URL}/wallet/transactions?page=1&limit=10`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        console.log('✅ Wallet transactions retrieved:');
        console.log(JSON.stringify(response.data, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Wallet transactions test failed:', error.response?.data || error.message);
        return false;
    }
}

async function testDepositInitiation() {
    try {
        console.log('\n💳 Testing deposit initiation...');
        const response = await axios.post(`${BASE_URL}/wallet/deposit`, {
            amount: 100,
            payment_method: 'telebirr'
        }, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ Deposit initiation successful:');
        console.log(JSON.stringify(response.data, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Deposit initiation test failed:', error.response?.data || error.message);
        return false;
    }
}

async function testWithdrawalRequest() {
    try {
        console.log('\n🏦 Testing withdrawal request...');
        const response = await axios.post(`${BASE_URL}/wallet/withdraw`, {
            amount: 50,
            bank_name: 'Commercial Bank of Ethiopia',
            account_number: '1234567890',
            account_holder_name: 'Test User',
            notes: 'Test withdrawal request'
        }, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ Withdrawal request successful:');
        console.log(JSON.stringify(response.data, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Withdrawal request test failed:', error.response?.data || error.message);
        return false;
    }
}

async function runAllTests() {
    console.log('🚀 Starting Wallet API Tests');
    console.log('Backend URL:', BASE_URL);
    console.log('='.repeat(50));
    
    const authSuccess = await authenticateWithOtp();
    if (!authSuccess) {
        console.log('\n❌ Cannot proceed without authentication');
        return;
    }
    
    const results = {
        balance: await testWalletBalance(),
        transactions: await testWalletTransactions(),
        deposit: await testDepositInitiation(),
        withdrawal: await testWithdrawalRequest()
    };
    
    console.log('\n' + '='.repeat(50));
    console.log('📋 TEST RESULTS SUMMARY:');
    console.log('='.repeat(50));
    
    Object.entries(results).forEach(([test, passed]) => {
        console.log(`${passed ? '✅' : '❌'} ${test.toUpperCase()}: ${passed ? 'PASSED' : 'FAILED'}`);
    });
    
    const passedTests = Object.values(results).filter(Boolean).length;
    const totalTests = Object.keys(results).length;
    
    console.log(`\n🎯 Overall: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All wallet APIs are working correctly!');
    } else {
        console.log('⚠️  Some tests failed. Check the logs above for details.');
    }
}

// Run the tests
runAllTests().catch(console.error);
