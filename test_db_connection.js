const { Client } = require('pg');

async function testConnection() {
    console.log('🔍 Testing PostgreSQL connection...');
    
    // Check environment variables
    const dbUrl = process.env.DATABASE_URL;
    console.log('📋 DATABASE_URL exists:', !!dbUrl);
    if (dbUrl) {
        console.log('📋 DATABASE_URL preview:', dbUrl.substring(0, 50) + '...');
    }
    
    if (!dbUrl) {
        console.error('❌ DATABASE_URL environment variable is not set!');
        process.exit(1);
    }
    
    const client = new Client({
        connectionString: dbUrl,
        ssl: {
            rejectUnauthorized: false
        }
    });
    
    try {
        console.log('🔗 Connecting to database...');
        await client.connect();
        console.log('✅ Connected successfully!');
        
        console.log('🔍 Testing basic query...');
        const result = await client.query('SELECT NOW() as current_time, version() as postgres_version');
        console.log('✅ Query successful!');
        console.log('📅 Current time:', result.rows[0].current_time);
        console.log('🐘 PostgreSQL version:', result.rows[0].postgres_version.substring(0, 50) + '...');
        
        console.log('🔍 Checking users table...');
        const usersCheck = await client.query('SELECT COUNT(*) as user_count FROM users');
        console.log('👥 Total users in database:', usersCheck.rows[0].user_count);
        
        console.log('🔍 Checking for specific user...');
        const userCheck = await client.query('SELECT id, phone_number FROM users WHERE phone_number = $1', ['+251931674207']);
        console.log('📱 User +251931674207 exists:', userCheck.rows.length > 0);
        if (userCheck.rows.length > 0) {
            console.log('👤 User details:', userCheck.rows[0]);
        }
        
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        console.error('❌ Full error:', error);
    } finally {
        await client.end();
        console.log('🔌 Connection closed');
    }
}

testConnection();
