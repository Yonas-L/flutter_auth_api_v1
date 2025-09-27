const axios = require('axios');

// Backend server URL (deployed on Render)
const BASE_URL = 'https://flutter-auth-api-v1.onrender.com';

async function testEndpointAvailability() {
    console.log('🚀 Testing Wallet Endpoint Availability');
    console.log('Backend URL:', BASE_URL);
    console.log('='.repeat(50));
    
    const endpoints = [
        { method: 'GET', path: '/wallet/balance', description: 'Wallet Balance' },
        { method: 'GET', path: '/wallet/transactions', description: 'Wallet Transactions' },
        { method: 'POST', path: '/wallet/deposit', description: 'Wallet Deposit' },
        { method: 'POST', path: '/wallet/withdraw', description: 'Wallet Withdrawal' }
    ];
    
    const results = {};
    
    for (const endpoint of endpoints) {
        try {
            console.log(`\n🔍 Testing ${endpoint.description} (${endpoint.method} ${endpoint.path})...`);
            
            const config = {
                method: endpoint.method.toLowerCase(),
                url: `${BASE_URL}${endpoint.path}`,
                timeout: 10000,
                validateStatus: function (status) {
                    // Accept any status code to see what we get
                    return status < 500;
                }
            };
            
            if (endpoint.method === 'POST') {
                config.data = { test: 'data' };
                config.headers = { 'Content-Type': 'application/json' };
            }
            
            const response = await axios(config);
            
            if (response.status === 401) {
                console.log(`✅ ${endpoint.description}: Endpoint exists (requires auth)`);
                results[endpoint.description] = 'AUTH_REQUIRED';
            } else if (response.status === 404) {
                console.log(`❌ ${endpoint.description}: Endpoint not found`);
                results[endpoint.description] = 'NOT_FOUND';
            } else if (response.status < 400) {
                console.log(`✅ ${endpoint.description}: Endpoint accessible`);
                results[endpoint.description] = 'ACCESSIBLE';
            } else {
                console.log(`⚠️  ${endpoint.description}: Status ${response.status}`);
                results[endpoint.description] = `STATUS_${response.status}`;
            }
            
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                console.log(`❌ ${endpoint.description}: Server not reachable`);
                results[endpoint.description] = 'SERVER_DOWN';
            } else if (error.response) {
                if (error.response.status === 401) {
                    console.log(`✅ ${endpoint.description}: Endpoint exists (requires auth)`);
                    results[endpoint.description] = 'AUTH_REQUIRED';
                } else if (error.response.status === 404) {
                    console.log(`❌ ${endpoint.description}: Endpoint not found`);
                    results[endpoint.description] = 'NOT_FOUND';
                } else {
                    console.log(`⚠️  ${endpoint.description}: Status ${error.response.status}`);
                    results[endpoint.description] = `STATUS_${error.response.status}`;
                }
            } else {
                console.log(`❌ ${endpoint.description}: ${error.message}`);
                results[endpoint.description] = 'ERROR';
            }
        }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📋 ENDPOINT AVAILABILITY SUMMARY:');
    console.log('='.repeat(50));
    
    Object.entries(results).forEach(([endpoint, status]) => {
        const icon = status === 'AUTH_REQUIRED' || status === 'ACCESSIBLE' ? '✅' : 
                    status === 'NOT_FOUND' ? '❌' : '⚠️';
        console.log(`${icon} ${endpoint}: ${status}`);
    });
    
    const workingEndpoints = Object.values(results).filter(status => 
        status === 'AUTH_REQUIRED' || status === 'ACCESSIBLE'
    ).length;
    const totalEndpoints = Object.keys(results).length;
    
    console.log(`\n🎯 Overall: ${workingEndpoints}/${totalEndpoints} endpoints are working`);
    
    if (workingEndpoints === totalEndpoints) {
        console.log('🎉 All wallet endpoints are deployed and accessible!');
    } else {
        console.log('⚠️  Some endpoints may not be deployed correctly.');
    }
}

// Test basic server connectivity first
async function testServerConnectivity() {
    try {
        console.log('🌐 Testing server connectivity...');
        const response = await axios.get(BASE_URL, { timeout: 10000 });
        console.log('✅ Server is reachable');
        console.log('Response:', response.data);
        return true;
    } catch (error) {
        console.error('❌ Server connectivity failed:', error.message);
        return false;
    }
}

async function runTests() {
    const serverReachable = await testServerConnectivity();
    if (!serverReachable) {
        console.log('\n❌ Cannot proceed - server is not reachable');
        return;
    }
    
    console.log('\n');
    await testEndpointAvailability();
}

// Run the tests
runTests().catch(console.error);
