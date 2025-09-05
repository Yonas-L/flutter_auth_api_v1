const { io } = require('socket.io-client');

console.log('🔌 Testing Socket.IO connection...');

// Test with a fake JWT token (will fail authentication but test connection)
const socket = io('ws://192.168.100.189:8080', {
    auth: {
        token: 'fake-jwt-token-for-testing'
    }
});

socket.on('connect', () => {
    console.log('✅ Connected to Socket.IO server');
    console.log('Socket ID:', socket.id);
});

socket.on('connected', (data) => {
    console.log('✅ Server response:', data);
});

socket.on('error', (error) => {
    console.log('❌ Socket error:', error);
});

socket.on('connect_error', (error) => {
    console.log('❌ Connection error:', error.message);
});

socket.on('disconnect', (reason) => {
    console.log('❌ Disconnected:', reason);
});

// Test for 3 seconds then disconnect
setTimeout(() => {
    console.log('🔌 Disconnecting...');
    socket.disconnect();
    process.exit(0);
}, 3000);
